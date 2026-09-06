import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import type { HealthCheckResult } from "../domain/types.js";
import type { Capabilities, DeviceClient } from "./DeviceClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.join(__dirname, "device.proto");

// Copied from devices/_shared/device.proto rather than imported across
// the monorepo boundary: in a real deployment this service ships as its
// own container without the devices/ folder, so the wire contract needs
// to travel with it — the same way a real system would version and
// publish a .proto separately rather than share a filesystem path.
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const deviceProto = grpc.loadPackageDefinition(packageDefinition).device as any;

function makeClient(address: string) {
  return new deviceProto.DeviceService(address, grpc.credentials.createInsecure());
}

const CALL_DEADLINE_MS = 2000;

function deadline() {
  return Date.now() + CALL_DEADLINE_MS;
}

/**
 * Stubbed per docs/assumptions.md #2: proven against the mock gRPC
 * devices in devices/camera-grpc and devices/door-access-grpc, not
 * against real hardware that doesn't exist in this scenario. The
 * DeviceClient interface is what makes this a safe thing to ship
 * incomplete — the poller and service layer don't know or care that
 * this implementation has never touched a real device.
 */
export class GrpcDeviceClient implements DeviceClient {
  async discoverCapabilities(address: string): Promise<Capabilities> {
    const client = makeClient(address);
    return new Promise((resolve, reject) => {
      client.getHealth({}, { deadline: deadline() }, (err: Error | null, res: Capabilities) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  async checkHealth(address: string): Promise<HealthCheckResult> {
    const client = makeClient(address);
    return new Promise((resolve) => {
      client.getHealth({}, { deadline: deadline() }, (err: Error | null) => {
        if (err) return resolve({ ok: false });
        client.getDiagnostics(
          {},
          { deadline: deadline() },
          (err2: Error | null, diag: any) => {
            if (err2) return resolve({ ok: false });
            resolve({
              ok: true,
              diagnostics: {
                hwVersion: diag.hwVersion,
                swVersion: diag.swVersion,
                fwVersion: diag.fwVersion,
                // proto3 scalar fields default to "" rather than being
                // absent, so an empty string here means "not reported"
                // and is normalized to null — matching the REST client's
                // behavior rather than storing "" in one path and null
                // in the other.
                deviceReportedStatus: diag.status || null,
              },
            });
          },
        );
      });
    });
  }
}
