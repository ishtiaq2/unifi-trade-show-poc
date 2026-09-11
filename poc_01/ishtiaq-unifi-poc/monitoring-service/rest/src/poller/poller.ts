// monitoring-service/rest/src/poller/poller.ts

import type { SQLService } from "../../../datasource-module/datasource/sql-service";
import type { Device, DiagnosticsPayload, HealthCheckResult } from "../../../datasource-module/domain/types";
import type { Logger } from "../domain/logger";
import { clientFor, discoverProtocol } from "../clients/clientFactory";
import { transition, DEFAULT_CONFIG, type StateMachineConfig } from "../domain/stateMachine";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const STATUS_COLORS = {
  reachable: "\x1b[32mreachable\x1b[0m", // Green
  suspect: "\x1b[33msuspect\x1b[0m",     // Yellow
  down: "\x1b[31mdown\x1b[0m",           // Red
};

export class Poller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly sql: SQLService,
    private readonly log: Logger,
    private readonly intervalMs = 10_000,
    // Threshold is a parameter with a default, not a hardcoded constant
    // buried in the logic — see stateMachine.ts. Reading it from here
    // (rather than always relying on transition()'s own internal
    // default) is what makes FAILURE_THRESHOLD in the environment
    // actually do something.
    private readonly stateMachineConfig: StateMachineConfig = DEFAULT_CONFIG,
  ) {}

  start(): void {
    if (this.running) return;

    this.running = true;
    this.log.info("poller started", { intervalMs: this.intervalMs });

    this.scheduleNext(0);
  }

  stop(): void {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.log.info("poller stopped");
  }

  // This is the engine
  async runCycle(): Promise<void> {
    const devices = await this.sql.listDevices();

    // Concurrent execution instead of sequential.
    // .catch() ensures one crashing device doesn't stop the rest.
    await Promise.all(
      devices.map((device) =>
        this.checkDevice(device).catch((error) => {
          this.log.error("unexpected error checking device", {
            deviceId: device.id,
            error: String(error),
          });
        })
      )
    );
    this.log.info("poll cycle complete", { deviceCount: devices.length });
  }

  private async checkDevice(device: Device): Promise<void> {
    if (!device.protocol) {
      await this.discoverDevice(device);
      return;
    }

    const client = clientFor(device.protocol);
    let result: HealthCheckResult = { ok: false };

    // Fast in-cycle retries for network blips
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await client.checkHealth(device.address);
      if (result.ok) break; // Success! Stop retrying.

      // If it failed, wait a moment before trying again (200ms, then 400ms)
      if (attempt < 2) {
        await sleep(200 * Math.pow(2, attempt));
      }
    }

    const newState = transition({
      currentStatus: device.status,
      consecutiveFailures: device.consecutiveFailures,
      checkSucceeded: result.ok,
      config: this.stateMachineConfig,
    });

    await this.sql.updateStatus(
      device.id,
      newState.status,
      newState.consecutiveFailures,
      result.ok,
    );

    await this.recordDiagnosticsReading(device.id, result.ok, result.diagnostics);

    // 1. HUMAN-READABLE COLORED TERMINAL OUTPUT
    console.log(`\n[HEARTBEAT] ${device.name} is ${STATUS_COLORS[newState.status]} (Failures: ${newState.consecutiveFailures})`);

    // 2. PURE JSON FOR LOG AGGREGATORS (No colors)
    this.log.info("device checked", {
      deviceName: device.name,
      networkReachable: result.ok,
      state: newState.status,
      consecutiveFailures: newState.consecutiveFailures
    });

    if (newState.status !== device.status) {
      this.log.info("device status changed", {
        deviceId: device.id,
        from: device.status,
        to: newState.status,
      });
    }
  }

  private async discoverDevice(device: Device): Promise<void> {
    try {
      const result = await discoverProtocol(device.address);

      await this.sql.setCapabilities(
        device.id,
        result.protocol,
        result.capabilities,
      );

      this.log.info("device discovered", {
        deviceId: device.id,
        protocol: result.protocol,
      });
    } catch (error) {
      // Still can't even tell what this device is. That's a "not
      // reachable" fact worth the same treatment as a failed health
      // check further down — recorded and deduplicated the same way,
      // not silently dropped.
      this.log.warn("device discovery pending", {
        deviceId: device.id,
        error: String(error),
      });
      await this.recordDiagnosticsReading(device.id, false);
    }
  }

  /**
   * Implements the dedup-and-preserve rule for diagnostics history:
   *
   *   - A reading identical in KIND to the latest stored row (same
   *     reachable + same device_reported_status) only bumps that row's
   *     timestamp. A device sitting at "reachable, ok" for an hour of
   *     ten-second polls produces ONE row, not 360 of them — and the
   *     SAME collapsing applies to a device stuck down: a whole outage
   *     is one row with an advancing timestamp, not one row per cycle.
   *   - Any change — including recovery — inserts a genuinely NEW row.
   *     Critically, this means an outage row is never later touched or
   *     overwritten by the recovery that follows it: once written, it
   *     stays in the table permanently, regardless of what the device
   *     does afterward. That permanence is the actual point.
   *
   * A failed check has no device data at all, so hw/sw/fw/reported
   * status are stored as null for those rows — never a poller-invented
   * value like a "not reachable" string in device_reported_status,
   * which would silently blur the device's-own-claim column with this
   * service's own conclusions. The row's existence and its timestamp
   * ARE the information; `reachable: false` says everything that can
   * honestly be said.
   */
  private async recordDiagnosticsReading(
    deviceId: string,
    reachable: boolean,
    diagnostics?: DiagnosticsPayload,
  ): Promise<void> {
    const newDeviceReportedStatus = reachable ? diagnostics?.deviceReportedStatus ?? null : null;

    const latest = await this.sql.latestDiagnostics(deviceId);
    const sameAsBefore =
      latest !== null &&
      latest.reachable === reachable &&
      latest.deviceReportedStatus === newDeviceReportedStatus;

    if (sameAsBefore) {
      await this.sql.touchLatestDiagnostics(deviceId);
      return;
    }

    await this.sql.recordDiagnostics(deviceId, {
      reachable,
      hwVersion: reachable ? diagnostics?.hwVersion ?? null : null,
      swVersion: reachable ? diagnostics?.swVersion ?? null : null,
      fwVersion: reachable ? diagnostics?.fwVersion ?? null : null,
      deviceReportedStatus: newDeviceReportedStatus,
      checksum: null, // Stubbed until Step 9 — honest null, never fabricated
    });
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return;

    this.timer = setTimeout(async () => {
      try {
        await this.runCycle();
      } catch (error) {
        this.log.error("poll cycle failed", {
          error: String(error),
        });
      }

      this.scheduleNext(this.intervalMs);
    }, delayMs);
  }
}
