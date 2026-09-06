import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DeviceRepository } from "../src/repo/deviceRepository.js";
import { MonitoringService } from "../src/service/monitoringService.js";
import { Poller } from "../src/poller/poller.js";
import { StubChecksumProvider } from "../src/checksum/ChecksumProvider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devicesDir = path.resolve(__dirname, "../../devices");
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc_test";

const DEVICE_PORT = 4201;

async function waitForHttp(url: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startDevice(reportedStatus: string): ChildProcess {
  return spawn(
    "node",
    [
      "-e",
      `
      const { createRestDevice } = require('${devicesDir}/_shared/rest-simulator');
      const app = createRestDevice({
        name: 'discovery-test-device',
        hwVersion: 'HW-1', swVersion: 'SW-1', fwVersion: 'FW-1',
        failureMode: 'none',
        reportedStatus: '${reportedStatus}',
      });
      app.listen(${DEVICE_PORT});
    `,
    ],
    { stdio: "pipe" },
  );
}

/**
 * Covers two paths that the other suites don't, both flagged as gaps in
 * an earlier review of this repo:
 *   1. Capability re-discovery — a device registered while unreachable
 *      keeps protocol=null, and the poller must recover it on a later
 *      cycle. Previously only verified by hand in a manual demo run.
 *   2. Device-reported status is captured into diagnostics and is
 *      genuinely independent of derived reachability.
 */
describe("capability discovery and diagnostics capture (real device, real Postgres)", () => {
  let pool: pg.Pool;
  let repo: DeviceRepository;
  let service: MonitoringService;
  let poller: Poller;
  let device: ChildProcess | null = null;

  beforeEach(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await pool.query("TRUNCATE devices, diagnostics RESTART IDENTITY CASCADE");
    repo = new DeviceRepository(pool);
    service = new MonitoringService(repo);
    poller = new Poller(repo, new StubChecksumProvider(), {
      intervalMs: 100_000, // cycles are driven manually via runCycle()
      stateMachineConfig: { failureThreshold: 2 },
    }, () => {});
  });

  afterEach(async () => {
    device?.kill();
    device = null;
    await pool.end();
  });

  it("recovers protocol for a device registered while unreachable, on a later poll cycle", async () => {
    // Register while nothing is listening — protocol can't be discovered.
    const registered = await service.registerDevice({
      name: "late-boot-device",
      address: `localhost:${DEVICE_PORT}`,
    });
    expect(registered.protocol).toBeNull();

    // Device comes online afterwards (e.g. finished booting on the
    // trade-show floor).
    device = startDevice("ok");
    await waitForHttp(`http://localhost:${DEVICE_PORT}/health`);

    await poller.runCycle();

    const recovered = await repo.getDevice(registered.id);
    expect(recovered?.protocol).toBe("rest");
    expect(recovered?.status).toBe("reachable");
  });

  it("captures the device's self-reported status separately from derived reachability", async () => {
    device = startDevice("degraded");
    await waitForHttp(`http://localhost:${DEVICE_PORT}/health`);

    const registered = await service.registerDevice({
      name: "degraded-device",
      address: `localhost:${DEVICE_PORT}`,
    });
    await poller.runCycle();

    const { device: current, diagnostics } = await service.getDeviceWithDiagnostics(
      registered.id,
    );

    // The service can reach it fine...
    expect(current.status).toBe("reachable");
    // ...but the device says it isn't healthy. Two different facts,
    // two different fields — which is the entire reason
    // device_reported_status is its own column.
    expect(diagnostics?.deviceReportedStatus).toBe("degraded");
    expect(diagnostics?.hwVersion).toBe("HW-1");
  });

  it("records a null checksum while the checksum binary is unavailable", async () => {
    device = startDevice("ok");
    await waitForHttp(`http://localhost:${DEVICE_PORT}/health`);

    const registered = await service.registerDevice({
      name: "checksum-device",
      address: `localhost:${DEVICE_PORT}`,
    });
    await poller.runCycle();

    const { diagnostics } = await service.getDeviceWithDiagnostics(registered.id);
    // Explicitly null, not a fabricated placeholder value — see
    // docs/assumptions.md #3.
    expect(diagnostics?.checksum).toBeNull();
  });
});
