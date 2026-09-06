import type { DeviceRepository } from "../repo/deviceRepository.js";
import type { ChecksumProvider } from "../checksum/ChecksumProvider.js";
import { clientFor, discoverProtocol } from "../clients/clientFactory.js";
import { transition, type StateMachineConfig } from "../domain/stateMachine.js";
import { backoffDelayMs, DEFAULT_BACKOFF, type BackoffConfig } from "../domain/backoff.js";
import type { Device } from "../domain/types.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PollerOptions {
  intervalMs: number;
  stateMachineConfig?: StateMachineConfig;
  backoffConfig?: BackoffConfig;
}

/**
 * Runs one check cycle across every registered device on a fixed
 * interval. Each device's check is retried (bounded, with backoff)
 * within the SAME cycle before the result is fed into the state
 * machine — this is what actually implements "unstable networks, don't
 * want false alarms" at the network-call level, distinct from the
 * suspect/down threshold which implements it at the multi-cycle level.
 * The two mechanisms answer different failure timescales: backoff
 * absorbs a single blip within one check; the state machine absorbs
 * a device having a bad few minutes.
 */
export class Poller {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private repo: DeviceRepository,
    private checksumProvider: ChecksumProvider,
    private options: PollerOptions,
    private log: (msg: string, meta?: Record<string, unknown>) => void = (msg, meta) =>
      console.log(JSON.stringify({ msg, ...meta })),
  ) {}

  start() {
    this.timer = setInterval(() => {
      this.runCycle().catch((err) => this.log("poller cycle failed", { error: String(err) }));
    }, this.options.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runCycle(): Promise<void> {
    const devices = await this.repo.listDevices();
    await Promise.all(devices.map((d) => this.checkOne(d)));
  }

  private async checkOne(device: Device): Promise<void> {
    // Undiscovered protocol: try discovery again before attempting a
    // health check — see monitoringService.registerDevice for why a
    // device can end up here.
    let protocol = device.protocol;
    if (!protocol) {
      try {
        const discovered = await discoverProtocol(device.address);
        protocol = discovered.protocol;
        await this.repo.setCapabilities(device.id, protocol, discovered.capabilities);
      } catch {
        this.recordTransition(device, false);
        return;
      }
    }

    const client = clientFor(protocol);
    const backoff = this.options.backoffConfig ?? DEFAULT_BACKOFF;

    let result = await client.checkHealth(device.address);
    let attempt = 0;
    while (!result.ok && attempt < backoff.maxAttempts - 1) {
      await sleep(backoffDelayMs(attempt, backoff));
      attempt += 1;
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

    await this.repo.updateStatus(device.id, next.status, next.consecutiveFailures, checkSucceeded);

    // One log line per state TRANSITION, not per check — a device being
    // fine for an hour shouldn't produce an hour of identical log lines
    // (per specification.md "Reliability behavior").
    if (next.status !== device.status) {
      this.log("device status changed", {
        deviceId: device.id,
        deviceName: device.name,
        from: device.status,
        to: next.status,
      });
    }
  }
}
