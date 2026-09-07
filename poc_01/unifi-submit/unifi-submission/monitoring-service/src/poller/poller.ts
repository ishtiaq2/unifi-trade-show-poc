import type { DeviceRepository } from "../repo/deviceRepository";
import type { ChecksumProvider } from "../checksum/ChecksumProvider";
import { clientFor, discoverProtocol } from "../clients/clientFactory";
import { transition, type StateMachineConfig } from "../domain/stateMachine";
import { backoffDelayMs, DEFAULT_BACKOFF, type BackoffConfig } from "../domain/backoff";
import type { Device } from "../domain/types";
import type { Logger } from "../domain/logger";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PollerOptions {
  intervalMs: number;
  stateMachineConfig?: StateMachineConfig;
  backoffConfig?: BackoffConfig;
}

/**
 * Checks every registered device on a fixed interval.
 *
 * There are two independent mechanisms guarding against false alarms,
 * answering different timescales:
 *
 *   1. Bounded retries with backoff, WITHIN one cycle — absorbs a single
 *      dropped packet or momentary blip.
 *   2. The reachable/suspect/down state machine, ACROSS cycles —
 *      absorbs a device having a genuinely bad few minutes.
 *
 * Either alone would be insufficient. Retries alone would still flip a
 * device to "down" the moment a blip outlasted the retry budget; the
 * state machine alone would waste whole cycles on failures a single
 * retry would have cured.
 */
export class Poller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private repo: DeviceRepository,
    private checksumProvider: ChecksumProvider,
    private options: PollerOptions,
    private log: Logger,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.runCycle().catch((error) =>
        this.log.error("poll cycle failed", { error: String(error) }),
      );
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Guarded against overlap: if a cycle is still running when the next
   * tick fires — entirely possible when many devices are timing out at
   * once — the new tick is skipped rather than piling a second full
   * sweep on top of the first.
   */
  async runCycle(): Promise<void> {
    if (this.running) {
      this.log.warn("poll cycle skipped; previous cycle still running");
      return;
    }
    this.running = true;
    try {
      const devices = await this.repo.listDevices();
      await Promise.all(devices.map((device) => this.checkOne(device)));
    } finally {
      this.running = false;
    }
  }

  private async checkOne(device: Device): Promise<void> {
    let protocol = device.protocol;

    // Devices registered while unreachable arrive here with no protocol.
    // Retry discovery before giving up on the cycle.
    if (!protocol) {
      try {
        const discovered = await discoverProtocol(device.address);
        protocol = discovered.protocol;
        await this.repo.setCapabilities(device.id, protocol, discovered.capabilities);
        this.log.info("capability discovery recovered", {
          deviceId: device.id,
          deviceName: device.name,
          protocol,
        });
      } catch {
        await this.recordTransition(device, false);
        return;
      }
    }

    const client = clientFor(protocol);
    const backoff = this.options.backoffConfig ?? DEFAULT_BACKOFF;

    let result = await client.checkHealth(device.address);
    for (let attempt = 0; !result.ok && attempt < backoff.maxAttempts - 1; attempt++) {
      await sleep(backoffDelayMs(attempt, backoff));
      result = await client.checkHealth(device.address);
    }

    await this.recordTransition(device, result.ok);

    if (result.ok && result.diagnostics) {
      const checksum = await this.checksumProvider.computeChecksum(result.diagnostics);
      await this.repo.recordDiagnostics(device.id, { ...result.diagnostics, checksum });
    }
  }

  private async recordTransition(device: Device, checkSucceeded: boolean): Promise<void> {
    const next = transition({
      currentStatus: device.status,
      consecutiveFailures: device.consecutiveFailures,
      checkSucceeded,
      config: this.options.stateMachineConfig,
    });

    await this.repo.updateStatus(
      device.id,
      next.status,
      next.consecutiveFailures,
      checkSucceeded,
    );

    // Log transitions, not checks. A healthy device polled every ten
    // seconds would otherwise produce 8,640 identical lines a day,
    // burying the handful of lines that actually matter.
    if (next.status !== device.status) {
      const meta = {
        deviceId: device.id,
        deviceName: device.name,
        from: device.status,
        to: next.status,
        consecutiveFailures: next.consecutiveFailures,
      };
      if (next.status === "down") this.log.error("device status changed", meta);
      else if (next.status === "suspect") this.log.warn("device status changed", meta);
      else this.log.info("device status changed", meta);
    }
  }
}
