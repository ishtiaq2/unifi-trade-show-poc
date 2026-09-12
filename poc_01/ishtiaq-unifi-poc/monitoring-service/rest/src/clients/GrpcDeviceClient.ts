import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { HealthCheckResult } from "../../../datasource-module/domain/types";
import type { Capabilities, DeviceClient } from "./clientFactory";

/**
 * Per-request deadline, matching RestDeviceClient's timeout. gRPC
 * deadlines are absolute timestamps, not durations — hence
 * `Date.now() + REQUEST_TIMEOUT_MS` at each call site rather than
 * passing the constant directly.
 *
 * Worth knowing: a deadline bounds how long THIS CLIENT waits, not how
 * long the server works. A call that exceeds it fails here with
 * DEADLINE_EXCEEDED while the server may still be processing it.
 */
const REQUEST_TIMEOUT_MS = 2_000;

/**
 * The contract lives at devices/_shared/device.proto, but this is a
 * verbatim copy inside rest/ on purpose: Docker cannot COPY from
 * outside a build context, and rest's context is monitoring-service/,
 * which doesn't contain devices/. A symlink would break in the image
 * for the same reason.
 *
 * Two copies of a contract is a real (if small) duplication risk — if
 * the .proto ever changes, both must change. The alternative (a shared
 * package, or a build step that copies it in) is more machinery than a
 * PoC with one fixed contract warrants. Noted here rather than left to
 * be discovered.
 */
const PROTO_PATH = path.join(__dirname, "proto", "device.proto");

/**
 * keepCase: false — MUST match devices/_shared/grpc-simulator.ts.
 *
 * This is the single most dangerous setting in this file. If the two
 * sides disagree, the data still arrives correctly on the wire, but
 * field names don't match what the reading side expects, so every
 * field reads `undefined` — with NO error, NO exception, and NO crash.
 * The symptom would be diagnostics silently full of nulls, which looks
 * exactly like a device not reporting anything.
 */
const loaderOptions: protoLoader.Options = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

interface HealthResponse {
  protocol: string;
  capabilities: string[];
  deviceName: string;
}

interface DiagnosticsResponse {
  hwVersion: string;
  swVersion: string;
  fwVersion: string;
  status: string;
}

let cachedProto: any = null;

/**
 * Loaded once and cached: parsing the .proto on every health check
 * would be wasted work on every poll cycle, for a file that cannot
 * change while the process is running.
 */
function loadDeviceProto(): any {
  if (!cachedProto) {
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, loaderOptions);
    cachedProto = (grpc.loadPackageDefinition(packageDefinition) as any).device;
  }
  return cachedProto;
}

/** Promise wrapper around a unary call, with an explicit deadline. */
function unaryCall<T>(client: any, method: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    client[method](
      {},
      { deadline: Date.now() + REQUEST_TIMEOUT_MS },
      (err: grpc.ServiceError | null, res: T) => (err ? reject(err) : resolve(res)),
    );
  });
}

export class GrpcDeviceClient implements DeviceClient {
  /**
   * One channel per address, reused across calls. grpc-js channels are
   * designed to be long-lived and handle reconnection internally —
   * building a new one per health check would discard that and add
   * connection setup to every single poll cycle.
   */
  private channels = new Map<string, any>();

  private clientFor(address: string): any {
    let client = this.channels.get(address);
    if (!client) {
      const proto = loadDeviceProto();
      client = new proto.DeviceService(address, grpc.credentials.createInsecure());
      this.channels.set(address, client);
    }
    return client;
  }

  async discoverCapabilities(address: string): Promise<Capabilities> {
    const res = await unaryCall<HealthResponse>(this.clientFor(address), "getHealth");
    return {
      protocol: "grpc",
      capabilities: res.capabilities ?? [],
      deviceName: res.deviceName,
    };
  }

  async checkHealth(address: string): Promise<HealthCheckResult> {
    try {
      const client = this.clientFor(address);

      // GetHealth first, mirroring RestDeviceClient: if a device can't
      // even report what it is, there's no point asking for details.
      await unaryCall<HealthResponse>(client, "getHealth");
      const diag = await unaryCall<DiagnosticsResponse>(client, "getDiagnostics");

      return {
        ok: true,
        diagnostics: {
          hwVersion: diag.hwVersion ?? null,
          swVersion: diag.swVersion ?? null,
          fwVersion: diag.fwVersion ?? null,
          // The device's own claim about itself, named `status` on the
          // wire — renamed here so it's never confused with this
          // service's derived Device.status. Same mapping
          // RestDeviceClient does, deliberately: both protocols must
          // produce identical domain objects, or the layers above
          // would have to know which protocol they're dealing with.
          deviceReportedStatus: diag.status ?? null,
        },
      };
    } catch {
      // UNAVAILABLE, DEADLINE_EXCEEDED, a closed channel — all are
      // simply "the check did not succeed". Never throws for an
      // unreachable device: that's a routine outcome the poller
      // handles, not an exception. Identical contract to
      // RestDeviceClient.checkHealth.
      return { ok: false };
    }
  }

  /**
   * Closes every open channel. Without this, grpc-js keeps its event
   * loop handles alive and the process won't exit cleanly on SIGTERM —
   * the same class of bug as the poller not being stopped in
   * shutdown(), which was a real, verified problem in step 7.
   */
  close(): void {
    for (const client of this.channels.values()) {
      client.close?.();
    }
    this.channels.clear();
  }
}
