import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { Pool } from "pg";
import { DeviceRepository } from "../src/repo/deviceRepository";
import { MonitoringService } from "../src/service/monitoringService";
import { Poller } from "../src/poller/poller";
import { StubChecksumProvider } from "../src/checksum/ChecksumProvider";
import { silentLogger } from "../src/domain/logger";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc_test";
const devicesDir = path.resolve(__dirname, "../../devices");

// Each test gets its own port. Sharing one port across tests made this
// suite flaky: `npx ts-node` spawns a grandchild process that outlives a
// kill() on the direct child, so a previous test's simulator could still
// be holding the port when the next test connected — producing failures
// that looked like protocol bugs but were really port reuse.
let nextPort = 4310;
const takePort = () => nextPort++;

async function waitFor(check: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for condition");
}

/** Spawns a simulator from ../devices, so tests exercise the same fixtures used for demos. */
function spawnDevice(script: string): ChildProcess {
  // detached so the whole process group can be signalled on cleanup;
  // killing only the direct child leaves the ts-node grandchild running.
  return spawn("npx", ["ts-node", "-e", script], {
    cwd: devicesDir,
    stdio: "pipe",
    detached: true,
  });
}

function killDevice(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL"); // negative pid = whole group
  } catch {
    child.kill("SIGKILL");
  }
}

/**
 * Exercises the protocol clients and poller against REAL running device
 * simulators over real sockets — no stubs for the transport layer.
 *
 * This is where protocol-level mistakes surface: a proto loader option
 * mismatch, a field-name casing difference, a timeout that never fires.
 * None of those are visible to a test that stubs DeviceClient.
 */
describe("device integration (real simulators, real Postgres)", () => {
  let pool: Pool;
  let repo: DeviceRepository;
  let service: MonitoringService;
  let poller: Poller;
  let device: ChildProcess | null = null;

  beforeEach(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query("TRUNCATE devices, diagnostics RESTART IDENTITY CASCADE");
    repo = new DeviceRepository(pool);
    service = new MonitoringService(repo, silentLogger);
    poller = new Poller(
      repo,
      new StubChecksumProvider(),
      { intervalMs: 3_600_000, stateMachineConfig: { failureThreshold: 2 } },
      silentLogger,
    );
  });

  afterEach(async () => {
    killDevice(device);
    device = null;
    await pool.end();
  });

  it("discovers a REST device and records its diagnostics", async () => {
    const REST_PORT = takePort();
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "it-rest", hwVersion: "HW-9", swVersion: "SW-9", fwVersion: "FW-9",
        failureMode: "none", reportedStatus: "ok", port: ${REST_PORT},
      }).listen(${REST_PORT});
    `);
    await waitFor(async () => (await fetch(`http://localhost:${REST_PORT}/health`)).ok);

    const registered = await service.registerDevice({
      name: "it-rest",
      address: `localhost:${REST_PORT}`,
    });
    expect(registered.protocol).toBe("rest");

    await poller.runCycle();

    const { device: current, diagnostics } = await service.getDeviceWithDiagnostics(
      registered.id,
    );
    expect(current.status).toBe("reachable");
    expect(diagnostics?.hwVersion).toBe("HW-9");
    expect(diagnostics?.fwVersion).toBe("FW-9");
  }, 30_000);

  it("discovers a gRPC device and records its diagnostics", async () => {
    const GRPC_PORT = takePort();
    // Proves protocol fallback works: discovery tries REST first, fails,
    // then succeeds over gRPC — without the caller knowing in advance.
    device = spawnDevice(`
      const { createGrpcDevice } = require("./_shared/grpc-simulator");
      const grpc = require("@grpc/grpc-js");
      const server = createGrpcDevice({
        name: "it-grpc", hwVersion: "GHW-1", swVersion: "GSW-1", fwVersion: "GFW-1",
        failureMode: "none", port: ${GRPC_PORT},
      });
      server.bindAsync("0.0.0.0:${GRPC_PORT}", grpc.ServerCredentials.createInsecure(), () => {});
    `);

    const registered = await (async () => {
      let last: Awaited<ReturnType<typeof service.registerDevice>> | null = null;
      await waitFor(async () => {
        await pool.query("TRUNCATE devices, diagnostics RESTART IDENTITY CASCADE");
        last = await service.registerDevice({
          name: "it-grpc",
          address: `localhost:${GRPC_PORT}`,
        });
        return last.protocol === "grpc";
      });
      return last!;
    })();

    expect(registered.protocol).toBe("grpc");

    await poller.runCycle();

    const { diagnostics } = await service.getDeviceWithDiagnostics(registered.id);
    expect(diagnostics?.hwVersion).toBe("GHW-1");
  }, 30_000);

  it("keeps device-reported status separate from derived reachability", async () => {
    const REST_PORT = takePort();
    // The switch case: answers every request perfectly while reporting a
    // fault about itself. Two different facts, two different fields.
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "it-degraded", hwVersion: "HW-1", swVersion: "SW-1", fwVersion: "FW-1",
        failureMode: "none", reportedStatus: "degraded", port: ${REST_PORT},
      }).listen(${REST_PORT});
    `);
    await waitFor(async () => (await fetch(`http://localhost:${REST_PORT}/health`)).ok);

    const registered = await service.registerDevice({
      name: "it-degraded",
      address: `localhost:${REST_PORT}`,
    });
    await poller.runCycle();

    const { device: current, diagnostics } = await service.getDeviceWithDiagnostics(
      registered.id,
    );
    expect(current.status).toBe("reachable");
    expect(diagnostics?.deviceReportedStatus).toBe("degraded");
  }, 30_000);

  it("records a null checksum while the external binary is unavailable", async () => {
    const REST_PORT = takePort();
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "it-checksum", hwVersion: "HW-1", swVersion: "SW-1", fwVersion: "FW-1",
        failureMode: "none", port: ${REST_PORT},
      }).listen(${REST_PORT});
    `);
    await waitFor(async () => (await fetch(`http://localhost:${REST_PORT}/health`)).ok);

    const registered = await service.registerDevice({
      name: "it-checksum",
      address: `localhost:${REST_PORT}`,
    });
    await poller.runCycle();

    const { diagnostics } = await service.getDeviceWithDiagnostics(registered.id);
    // Explicitly null, never a fabricated value — see ChecksumProvider.
    expect(diagnostics?.checksum).toBeNull();
  }, 30_000);

  it("recovers protocol for a device registered before it came online", async () => {
    const REST_PORT = takePort();
    const registered = await service.registerDevice({
      name: "it-late",
      address: `localhost:${REST_PORT}`,
    });
    expect(registered.protocol).toBeNull();

    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "it-late", hwVersion: "HW-2", swVersion: "SW-2", fwVersion: "FW-2",
        failureMode: "none", port: ${REST_PORT},
      }).listen(${REST_PORT});
    `);
    await waitFor(async () => (await fetch(`http://localhost:${REST_PORT}/health`)).ok);

    await poller.runCycle();

    const recovered = await repo.getDevice(registered.id);
    expect(recovered?.protocol).toBe("rest");
    expect(recovered?.status).toBe("reachable");
  }, 30_000);
});
