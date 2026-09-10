// monitoring-service/rest/src/poller/poller.ts

import type { SQLService } from "../../../datasource-module/datasource/sql-service";
import type { Device, HealthCheckResult } from "../../../datasource-module/domain/types";
import type { Logger } from "../domain/logger";
import { clientFor, discoverProtocol } from "../clients/clientFactory";
import { transition } from "../domain/stateMachine";

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
    });

    await this.sql.updateStatus(
      device.id,
      newState.status,
      newState.consecutiveFailures,
      result.ok,
    );

    if (result.ok && result.diagnostics) {
      await this.sql.recordDiagnostics(device.id, {
        ...result.diagnostics,
        checksum: null, // Stubbed until Step 9
      });
    } else if (!result.ok) {
      // Device is unreachable, explicitly log the failure event
      await this.sql.recordDiagnostics(device.id, {
        hwVersion: null,
        swVersion: null,
        fwVersion: null,
        deviceReportedStatus: "not reachable", // This will trigger an INSERT
        checksum: null,
      });
    }

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
      this.log.info("device discovery pending", {
        deviceId: device.id,
        error: String(error),
      });
    }
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
