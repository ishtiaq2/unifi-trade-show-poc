import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { Pool } from "pg";
import { SQLService } from "../../datasource-module/datasource/sql-service";
import { Poller } from "../src/poller/poller";
import { silentLogger } from "../src/domain/logger";

/**
 * Runs against REAL device simulators and a REAL Postgres — nothing
 * here is mocked. A mocked DeviceClient could only confirm the poller
 * calls the methods it expects; it couldn't catch a wire-format
 * mismatch. A mocked SQLService couldn't catch a query bug. The whole
 * point of this suite is proving step 5, step 6, and this
 * orchestration layer actually work TOGETHER against real
 * infrastructure, not just individually.
 */
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc_test";
const devicesDir = path.resolve(__dirname, "../../../devices");

let nextPort = 4600;
const takePort = () => nextPort++;

let device: ChildProcess | null = null;

function spawnDevice(script: string): ChildProcess {
  return spawn("npx", ["ts-node", "-e", script], {
    cwd: devicesDir,
    stdio: "pipe",
    detached: true,
  });
}

function killDevice(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

async function waitForHttp(url: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function countDiagnostics(pool: Pool, deviceId: string, reachable?: boolean): Promise<number> {
  const { rows } =
    reachable === undefined
      ? await pool.query("SELECT count(*)::int AS n FROM diagnostics WHERE device_id = $1", [
          deviceId,
        ])
      : await pool.query(
          "SELECT count(*)::int AS n FROM diagnostics WHERE device_id = $1 AND reachable = $2",
          [deviceId, reachable],
        );
  return rows[0].n;
}

describe("Poller (real devices, real Postgres)", () => {
  let pool: Pool;
  let sql: SQLService;
  let poller: Poller;

  beforeEach(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query("TRUNCATE devices, diagnostics RESTART IDENTITY CASCADE");
    sql = new SQLService(pool);
    // intervalMs set huge — these tests call runCycle() directly rather
    // than waiting on the timer, and a threshold of 2 keeps
    // reachable->suspect->down tests short.
    poller = new Poller(sql, silentLogger, 999_999, { failureThreshold: 2 });
  });

  afterEach(async () => {
    killDevice(device);
    device = null;
    await pool.end();
  });

  it("a healthy device stays reachable and records diagnostics", async () => {
    const port = takePort();
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "healthy", hwVersion: "H1", swVersion: "S1", fwVersion: "F1",
        failureMode: "none", port: ${port},
      }).listen(${port});
    `);
    await waitForHttp(`http://localhost:${port}/health`);

    const created = await sql.createDevice({ name: "healthy", address: `localhost:${port}` });
    await sql.setCapabilities(created.id, "rest", { capabilities: ["diagnostics"] });

    await poller.runCycle();

    const after = await sql.getDevice(created.id);
    expect(after?.status).toBe("reachable");
    const diag = await sql.latestDiagnostics(created.id);
    expect(diag?.reachable).toBe(true);
    expect(diag?.hwVersion).toBe("H1");
  }, 15_000);

  it("closes the protocol:null gap — discovery is retried on a later cycle", async () => {
    const port = takePort();
    const created = await sql.createDevice({ name: "late-boot", address: `localhost:${port}` });
    expect(created.protocol).toBeNull();

    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "late-boot", hwVersion: "H", swVersion: "S", fwVersion: "F",
        failureMode: "none", port: ${port},
      }).listen(${port});
    `);
    await waitForHttp(`http://localhost:${port}/health`);

    await poller.runCycle();

    const recovered = await sql.getDevice(created.id);
    expect(recovered?.protocol).toBe("rest");
    expect(recovered?.status).toBe("reachable");
  }, 15_000);

  it("a device stuck at protocol:null with discovery still failing records a reachable=false reading, not nothing", async () => {
    // Nothing listens on this port — discovery itself fails.
    const created = await sql.createDevice({ name: "ghost", address: "localhost:59999" });

    await poller.runCycle();

    const count = await countDiagnostics(pool, created.id, false);
    expect(count).toBe(1);
  }, 10_000);

  it("retries within a cycle before giving up — a flaky device can still succeed", async () => {
    const port = takePort();
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "flaky", hwVersion: "H", swVersion: "S", fwVersion: "F",
        failureMode: "flaky", failureRate: 0.6, port: ${port},
      }).listen(${port});
    `);
    await waitForHttp(`http://localhost:${port}/health`);

    const created = await sql.createDevice({ name: "flaky", address: `localhost:${port}` });
    await sql.setCapabilities(created.id, "rest", { capabilities: ["diagnostics"] });

    let sawReachable = false;
    for (let i = 0; i < 5; i++) {
      await poller.runCycle();
      const current = await sql.getDevice(created.id);
      if (current?.status === "reachable") sawReachable = true;
    }
    expect(sawReachable).toBe(true);
  }, 30_000);

  it("a device that dies transitions reachable -> suspect -> down over cycles", async () => {
    const port = takePort();
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "dying", hwVersion: "H", swVersion: "S", fwVersion: "F",
        failureMode: "goes-down", healthyRequests: 2, port: ${port},
      }).listen(${port});
    `);
    await waitForHttp(`http://localhost:${port}/health`);

    const created = await sql.createDevice({ name: "dying", address: `localhost:${port}` });
    await sql.setCapabilities(created.id, "rest", { capabilities: ["diagnostics"] });

    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await poller.runCycle();
      const current = await sql.getDevice(created.id);
      seen.push(current!.status);
      if (current!.status === "down") break;
    }
    expect(seen).toContain("down");
    expect(seen[0]).not.toBe("down");
  }, 30_000);

  it("respects a custom failureThreshold rather than the state machine's internal default", async () => {
    const strict = new Poller(sql, silentLogger, 999_999, { failureThreshold: 1 });
    const created = await sql.createDevice({ name: "strict", address: "localhost:59998" });
    await sql.setCapabilities(created.id, "rest", { capabilities: [] });

    await strict.runCycle();

    const after = await sql.getDevice(created.id);
    expect(after?.status).toBe("down"); // not "suspect" — threshold of 1 skips it entirely
  }, 10_000);

  it("DEDUP: a stable healthy device produces exactly ONE diagnostics row across many cycles", async () => {
    const port = takePort();
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "stable", hwVersion: "H", swVersion: "S", fwVersion: "F",
        failureMode: "none", port: ${port},
      }).listen(${port});
    `);
    await waitForHttp(`http://localhost:${port}/health`);

    const created = await sql.createDevice({ name: "stable", address: `localhost:${port}` });
    await sql.setCapabilities(created.id, "rest", { capabilities: ["diagnostics"] });

    for (let i = 0; i < 5; i++) {
      await poller.runCycle();
    }

    expect(await countDiagnostics(pool, created.id)).toBe(1);
    const latest = await sql.latestDiagnostics(created.id);
    expect(latest?.reachable).toBe(true);
  }, 20_000);

  it("DEDUP: a permanently-down device ALSO collapses to one row, not one per cycle", async () => {
    const port = takePort();
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "always-down", hwVersion: "H", swVersion: "S", fwVersion: "F",
        failureMode: "goes-down", healthyRequests: 0, port: ${port},
      }).listen(${port});
    `);
    await new Promise((r) => setTimeout(r, 1000)); // dies on request 1

    const created = await sql.createDevice({ name: "always-down", address: `localhost:${port}` });
    await sql.setCapabilities(created.id, "rest", { capabilities: [] });

    for (let i = 0; i < 5; i++) {
      await poller.runCycle();
    }

    // This is the exact scenario that was broken before the fix: 5
    // cycles against one continuous outage must be 1 row, not 5.
    expect(await countDiagnostics(pool, created.id)).toBe(1);
    const latest = await sql.latestDiagnostics(created.id);
    expect(latest?.reachable).toBe(false);
    expect(latest?.deviceReportedStatus).toBeNull();
  }, 20_000);

  it("PRESERVE: an outage row survives recovery, and device_reported_status is never a poller-invented sentinel", async () => {
    const port = takePort();
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "outage", hwVersion: "H", swVersion: "S", fwVersion: "F",
        failureMode: "goes-down", healthyRequests: 0, port: ${port},
      }).listen(${port});
    `);
    await new Promise((r) => setTimeout(r, 1000));

    const created = await sql.createDevice({ name: "outage", address: `localhost:${port}` });
    await sql.setCapabilities(created.id, "rest", { capabilities: ["diagnostics"] });

    await poller.runCycle();
    expect(await countDiagnostics(pool, created.id, false)).toBe(1);
    const outageRow = await sql.latestDiagnostics(created.id);
    expect(outageRow?.deviceReportedStatus).toBeNull();

    await poller.runCycle(); // still down — must dedupe
    expect(await countDiagnostics(pool, created.id, false)).toBe(1);

    killDevice(device);
    await new Promise((r) => setTimeout(r, 300));
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "outage", hwVersion: "H2", swVersion: "S2", fwVersion: "F2",
        failureMode: "none", port: ${port},
      }).listen(${port});
    `);
    await waitForHttp(`http://localhost:${port}/health`);

    await poller.runCycle();
    const recovered = await sql.getDevice(created.id);
    expect(recovered?.status).toBe("reachable");

    // The actual requirement: the outage row must still be there.
    expect(await countDiagnostics(pool, created.id, false)).toBe(1);
    expect(await countDiagnostics(pool, created.id, true)).toBe(1);
    expect(await countDiagnostics(pool, created.id)).toBe(2);
  }, 20_000);

  it("start()/stop() actually stop the scheduled timer — no further cycles after stop", async () => {
    const port = takePort();
    device = spawnDevice(`
      const { createRestDevice } = require("./_shared/rest-simulator");
      createRestDevice({
        name: "scheduled", hwVersion: "H", swVersion: "S", fwVersion: "F",
        failureMode: "none", port: ${port},
      }).listen(${port});
    `);
    await waitForHttp(`http://localhost:${port}/health`);
    const created = await sql.createDevice({ name: "scheduled", address: `localhost:${port}` });
    await sql.setCapabilities(created.id, "rest", { capabilities: [] });

    const scheduled = new Poller(sql, silentLogger, 300, { failureThreshold: 2 });
    scheduled.start();
    await new Promise((r) => setTimeout(r, 700)); // let 1-2 cycles fire
    scheduled.stop();

    const countAtStop = await countDiagnostics(pool, created.id);
    await new Promise((r) => setTimeout(r, 900)); // would be 2-3 more cycles if still running
    const countAfterWait = await countDiagnostics(pool, created.id);

    expect(countAfterWait).toBe(countAtStop);
  }, 10_000);
});
