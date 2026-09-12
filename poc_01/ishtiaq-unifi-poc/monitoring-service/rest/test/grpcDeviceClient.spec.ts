import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { GrpcDeviceClient } from "../src/clients/GrpcDeviceClient";
import { discoverProtocol, clientFor } from "../src/clients/clientFactory";

/**
 * Runs against REAL gRPC device simulators over real sockets — real
 * HTTP/2, real protobuf framing, real gRPC status codes. Nothing is
 * mocked, for the same reason restDeviceClient.test.ts isn't: a mock
 * could only confirm this code calls the methods the test expects. It
 * could not catch the failure that actually matters here — a
 * keepCase mismatch between client and server, which produces
 * undefined fields with NO error at all.
 */
const devicesDir = path.resolve(__dirname, "../../../devices");

let nextPort = 4700;
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

/**
 * gRPC devices can't be probed with fetch (HTTP/2 + protobuf), so
 * readiness is checked by attempting a real gRPC call until one
 * succeeds — which doubles as proof the server is genuinely speaking
 * gRPC, not merely listening on the port.
 */
async function waitForGrpc(address: string, timeoutMs = 8000): Promise<void> {
  const client = new GrpcDeviceClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await client.discoverCapabilities(address);
      client.close();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  client.close();
  throw new Error(`Timed out waiting for gRPC device at ${address}`);
}

function grpcDeviceScript(name: string, port: number, extra = ""): string {
  // startGrpcDevice, not createGrpcDevice — the latter returns an
  // UNBOUND server. Binding is startGrpcDevice's job (it also binds
  // 0.0.0.0 rather than localhost, which matters in containers).
  return `
    const { startGrpcDevice } = require("./_shared/start-grpc");
    startGrpcDevice({
      name: "${name}", hwVersion: "GH-1", swVersion: "GS-1", fwVersion: "GF-1",
      failureMode: "none", port: ${port}, ${extra}
    });
  `;
}

describe("GrpcDeviceClient (real gRPC devices, real sockets)", () => {
  afterEach(() => {
    killDevice(device);
    device = null;
  });

  it("discovers capabilities from a real gRPC device", async () => {
    const port = takePort();
    device = spawnDevice(grpcDeviceScript("test-grpc-cam", port));
    await waitForGrpc(`localhost:${port}`);

    const client = new GrpcDeviceClient();
    const caps = await client.discoverCapabilities(`localhost:${port}`);
    client.close();

    expect(caps.protocol).toBe("grpc");
    expect(caps.deviceName).toBe("test-grpc-cam");
  }, 20_000);

  it("checkHealth returns real diagnostics — proving keepCase matches the server", async () => {
    const port = takePort();
    device = spawnDevice(grpcDeviceScript("keepcase-check", port));
    await waitForGrpc(`localhost:${port}`);

    const client = new GrpcDeviceClient();
    const result = await client.checkHealth(`localhost:${port}`);
    client.close();

    expect(result.ok).toBe(true);
    // These assertions are the entire point of this test. A keepCase
    // mismatch between this client and grpc-simulator.ts would leave
    // every one of these undefined, silently, with no error raised
    // anywhere — the data would still arrive correctly on the wire.
    expect(result.diagnostics?.hwVersion).toBe("GH-1");
    expect(result.diagnostics?.swVersion).toBe("GS-1");
    expect(result.diagnostics?.fwVersion).toBe("GF-1");
  }, 20_000);

  it("maps the wire's 'status' field to deviceReportedStatus, same as REST", async () => {
    const port = takePort();
    device = spawnDevice(
      grpcDeviceScript("degraded-grpc", port, 'reportedStatus: "degraded",'),
    );
    await waitForGrpc(`localhost:${port}`);

    const client = new GrpcDeviceClient();
    const result = await client.checkHealth(`localhost:${port}`);
    client.close();

    // Both protocols must produce identical domain objects — otherwise
    // every layer above would need to know which protocol it's holding.
    expect(result.diagnostics?.deviceReportedStatus).toBe("degraded");
  }, 20_000);

  it("checkHealth returns ok:false for an unreachable device, never throws", async () => {
    const client = new GrpcDeviceClient();
    const result = await client.checkHealth("localhost:59999");
    client.close();

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toBeUndefined();
  }, 10_000);

  it("discoverCapabilities throws when nothing is listening (no silent fallback)", async () => {
    const client = new GrpcDeviceClient();
    await expect(client.discoverCapabilities("localhost:59998")).rejects.toThrow();
    client.close();
  }, 10_000);

  it("clientFor('grpc') now returns a working client instead of throwing", async () => {
    const port = takePort();
    device = spawnDevice(grpcDeviceScript("factory-check", port));
    await waitForGrpc(`localhost:${port}`);

    // Before step 8 this threw "gRPC devices are not supported until step 8".
    const client = clientFor("grpc");
    const result = await client.checkHealth(`localhost:${port}`);

    expect(result.ok).toBe(true);
  }, 20_000);
});

describe("discoverProtocol — REST first, gRPC fallback", () => {
  afterEach(() => {
    killDevice(device);
    device = null;
  });

  it("falls back to gRPC when REST discovery fails", async () => {
    const port = takePort();
    device = spawnDevice(grpcDeviceScript("fallback-check", port));
    await waitForGrpc(`localhost:${port}`);

    const result = await discoverProtocol(`localhost:${port}`);

    expect(result.protocol).toBe("grpc");
    expect(result.capabilities).toBeTruthy();
  }, 20_000);

  it("throws when a device answers neither protocol", async () => {
    await expect(discoverProtocol("localhost:59997")).rejects.toThrow();
  }, 15_000);
});
