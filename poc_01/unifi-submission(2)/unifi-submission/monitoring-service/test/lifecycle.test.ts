import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import path from "path";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc_test";
const serviceDir = path.resolve(__dirname, "..");
const devicesDir = path.resolve(__dirname, "../../devices");

const SERVICE_PORT = 3399;
const SERVICE_URL = `http://localhost:${SERVICE_PORT}`;
const DEVICE_PORT = 4399;

/**
 * The suite that answers the brief's "It must be paired with the PoC
 * life-cycle to get valid test results" (see docs/assumptions.md #1 for
 * how that line was interpreted).
 *
 * Nothing here is mocked. It boots the REAL entrypoint as a separate
 * process — the same `src/index.ts` that runs in production, through its
 * real config loading, real database connection, real poller and real
 * HTTP server — drives a real device simulator from healthy to dead, and
 * shuts down through the real SIGTERM handler.
 *
 * It is slower than the other suites. That slowness is the cost of the
 * results actually meaning something: a passing unit test proves the
 * state machine is correct, but only this proves the wired-together
 * service is.
 */
let service: ChildProcess;
let device: ChildProcess;
const serviceLogs: string[] = [];

function killTree(child: ChildProcess | undefined, signal: NodeJS.Signals): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

async function waitForOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

describe("life-cycle", () => {
  beforeAll(async () => {
    // A device that answers a few requests then dies permanently.
    device = spawn(
      "npx",
      [
        "ts-node",
        "-e",
        `
        const { createRestDevice } = require("./_shared/rest-simulator");
        createRestDevice({
          name: "lifecycle-device",
          hwVersion: "LC-HW", swVersion: "LC-SW", fwVersion: "LC-FW",
          failureMode: "none",
          port: ${DEVICE_PORT},
        }).listen(${DEVICE_PORT});
      `,
      ],
      { cwd: devicesDir, stdio: "pipe", detached: true },
    );
    await waitForOk(`http://localhost:${DEVICE_PORT}/health`, 20_000);

    service = spawn("npx", ["ts-node", "src/index.ts"], {
      cwd: serviceDir,
      stdio: "pipe",
      detached: true,
      env: {
        ...process.env,
        PORT: String(SERVICE_PORT),
        DATABASE_URL,
        POLL_INTERVAL_MS: "300",
        FAILURE_THRESHOLD: "2",
      },
    });
    service.stdout?.on("data", (chunk: Buffer) => serviceLogs.push(chunk.toString()));
    service.stderr?.on("data", (chunk: Buffer) => serviceLogs.push(chunk.toString()));

    await waitForOk(`${SERVICE_URL}/healthz`, 30_000);
  }, 60_000);

  afterAll(async () => {
    // SIGTERM, not SIGKILL: exercising the real graceful-shutdown path is
    // part of what "life-cycle" means here. A service that cannot shut
    // down cleanly leaks database connections across the repeated
    // restarts that happen while setting up at a venue.
    killTree(service, "SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    killTree(service, "SIGKILL");
    killTree(device, "SIGKILL");
  });

  it("starts up and reports healthy", async () => {
    const res = await fetch(`${SERVICE_URL}/healthz`);
    expect(res.status).toBe(200);
  });

  it("registers a real device over the real API and discovers its protocol", async () => {
    const res = await fetch(`${SERVICE_URL}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "lifecycle-device",
        address: `localhost:${DEVICE_PORT}`,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { protocol: string | null };
    expect(body.protocol).toBe("rest");
  });

  it("passes through suspect before declaring the device down", async () => {
    // The device is killed outright rather than configured to fail after
    // N requests. An earlier version used the simulator's "goes-down"
    // counter, which made this test non-deterministic: the readiness
    // probe and capability discovery each consume requests from that
    // counter, so how much life the device had left by the time polling
    // started varied between runs. Killing the process removes the
    // ambiguity — connection refused is unambiguous, and it models the
    // real scenario (a device losing power at the venue) more honestly
    // than a request budget does.
    killTree(device, "SIGKILL");

    // Asserted against the poller's own structured transition logs, not
    // by polling the API on a timer.
    //
    // An earlier version of this test did poll the API, and was flaky:
    // with a 300ms poll interval it could sample straight past the brief
    // window where the device sat in `suspect`. That was a defect in how
    // the test observed the system, not in the system — the state
    // machine's unit tests prove independently that `suspect` cannot be
    // skipped. Reading the emitted log lines removes the race entirely
    // rather than papering over it with longer sleeps.
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (serviceLogs.join("").includes('"to":"down"')) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    const combined = serviceLogs.join("");
    const suspectAt = combined.indexOf('"to":"suspect"');
    const downAt = combined.indexOf('"to":"down"');

    expect(downAt).toBeGreaterThan(-1);
    expect(suspectAt).toBeGreaterThan(-1);
    expect(suspectAt).toBeLessThan(downAt);
  }, 25_000);

  it("exposes the down state through the public API", async () => {
    const res = await fetch(`${SERVICE_URL}/devices`);
    const devices = (await res.json()) as Array<{ name: string; status: string }>;
    const target = devices.find((d) => d.name === "lifecycle-device");
    expect(target?.status).toBe("down");
  });
});
