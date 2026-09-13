import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { RestDeviceClient } from "../clients/RestDeviceClient";

/**
 * Runs against REAL device simulators over real sockets, not stubs —
 * spawned from devices/ the same way the earlier device-fixture work
 * verified them. A stubbed HTTP client could only confirm this code
 * calls fetch with the right URL; it could not catch a wire-format
 * mismatch between what a device actually returns and what this client
 * expects, which is exactly the kind of bug that matters here.
 */
const devicesDir = path.resolve(__dirname, "../../devices");
const PORT = 4301;

let device: ChildProcess | null = null;

async function waitForHttp(url: string, timeoutMs = 5000): Promise<void> {
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
    process.kill(-child.pid, "SIGKILL"); // negative pid = whole process group
  } catch {
    child.kill("SIGKILL");
  }
}

describe("RestDeviceClient (real device, real sockets)", () => {
  const client = new RestDeviceClient();

  afterEach(() => {
    killDevice(device);
    device = null;
  });

  it("discovers capabilities from a real device", async () => {
    device = spawnDevice(`
      const { createRestDevice } = require("./01-rest/common/rest-simulator");
      createRestDevice({
        name: "test-router", hwVersion: "H", swVersion: "S", fwVersion: "F",
        failureMode: "none", port: ${PORT},
      }).listen(${PORT});
    `);
    await waitForHttp(`http://localhost:${PORT}/health`);

    const caps = await client.discoverCapabilities(`localhost:${PORT}`);
    expect(caps.protocol).toBe("rest");
    expect(caps.deviceName).toBe("test-router");
  }, 15_000);

  it("checkHealth returns diagnostics with deviceReportedStatus renamed from the wire's 'status'", async () => {
    device = spawnDevice(`
      const { createRestDevice } = require("./01-rest/common/rest-simulator");
      createRestDevice({
        name: "test-switch", hwVersion: "HW-9", swVersion: "SW-9", fwVersion: "FW-9",
        failureMode: "none", reportedStatus: "degraded", port: ${PORT},
      }).listen(${PORT});
    `);
    await waitForHttp(`http://localhost:${PORT}/health`);

    const result = await client.checkHealth(`localhost:${PORT}`);
    expect(result.ok).toBe(true);
    expect(result.diagnostics?.hwVersion).toBe("HW-9");
    // This is the field that matters most: the device calls it "status"
    // on the wire, and it must arrive here as deviceReportedStatus, not
    // silently dropped or misnamed.
    expect(result.diagnostics?.deviceReportedStatus).toBe("degraded");
  }, 15_000);

  it("checkHealth returns ok:false for an unreachable device, never throws", async () => {
    // Nothing listens on this port.
    const result = await client.checkHealth("localhost:59999");
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toBeUndefined();
  });

  it("checkHealth returns ok:false against a device that is failing (goes-down mode)", async () => {
    device = spawnDevice(`
      const { createRestDevice } = require("./01-rest/common/rest-simulator");
      createRestDevice({
        name: "test-dying", hwVersion: "H", swVersion: "S", fwVersion: "F",
        failureMode: "goes-down", healthyRequests: 0, port: ${PORT},
      }).listen(${PORT});
    `);
    // No waitForHttp here on purpose: this device fails from its very
    // first request, so a readiness probe waiting for a 200 would only
    // time out and waste several seconds. A fixed delay is enough for
    // the process itself to start listening (confirmed elsewhere in
    // this suite to happen well under 500ms).
    await new Promise((r) => setTimeout(r, 700));

    const result = await client.checkHealth(`localhost:${PORT}`);
    expect(result.ok).toBe(false);
  }, 5_000);

  it("discoverCapabilities throws (does not return a fallback) when nothing is listening", async () => {
    await expect(client.discoverCapabilities("localhost:59999")).rejects.toThrow();
  });
});
