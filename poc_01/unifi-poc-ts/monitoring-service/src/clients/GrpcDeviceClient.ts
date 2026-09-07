import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { HealthCheckResult } from "../domain/types";
import type { Capabilities, DeviceClient } from "./DeviceClient";

/**
 * The .proto lives in this service's own source tree rather than being
 * imported from ../devices. The devices folder is a test fixture that
 * will not exist in a real deployment — the wire contract has to travel
 * with the service that speaks it. In a production system this would be
 * a versioned, published schema rather than a copied file, but a copy
 * with this note beats a filesystem dependency on a fixture.
 */
const PROTO_PATH = path.join(__dirname, "device.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  // Must match the simulators' loader options. With keepCase:true the
  // fields arrive snake_cased and every read silently yields undefined
  // rather than throwing — a genuinely nasty failure mode, so this is
  // pinned deliberately on both sides.
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const deviceProto = (grpc.loadPackageDefinition(packageDefinition) as any).device;

const CALL_TIMEOUT_MS = 2_000;
const deadline = () => Date.now() + CALL_TIMEOUT_MS;

interface GrpcDiagnostics {
  hwVersion: string;
  swVersion: string;
  fwVersion: string;
  status: string;
}

/**
 * Proven against the mock gRPC devices in ../devices, not against real
 * hardware — none exists in this scenario (docs/assumptions.md #2). The
 * DeviceClient interface is what makes shipping this honestly-incomplete
 * implementation safe: nothing above it depends on how complete it is.
 */
export class GrpcDeviceClient implements DeviceClient {
  private clientFor(address: string): any {
    return new deviceProto.DeviceService(address, grpc.credentials.createInsecure());
  }

  async discoverCapabilities(address: string): Promise<Capabilities> {
    const client = this.clientFor(address);
    return new Promise<Capabilities>((resolve, reject) => {
      client.getHealth(
        {},
        { deadline: deadline() },
        (err: grpc.ServiceError | null, res: Capabilities) => {
          client.close?.();
          if (err) return reject(err);
          resolve(res);
        },
      );
    });
  }

  async checkHealth(address: string): Promise<HealthCheckResult> {
    const client = this.clientFor(address);
    return new Promise<HealthCheckResult>((resolve) => {
      client.getHealth({}, { deadline: deadline() }, (err: grpc.ServiceError | null) => {
        if (err) {
          client.close?.();
          return resolve({ ok: false });
        }
        client.getDiagnostics(
          {},
          { deadline: deadline() },
          (err2: grpc.ServiceError | null, diag: GrpcDiagnostics) => {
            client.close?.();
            if (err2) return resolve({ ok: false });
            resolve({
              ok: true,
              diagnostics: {
                hwVersion: diag.hwVersion,
                swVersion: diag.swVersion,
                fwVersion: diag.fwVersion,
                // proto3 scalars default to "" rather than being absent,
                // so an empty string means "not reported" and is
                // normalised to null to match the REST client. Without
                // this the two protocols would store different values
                // for the same real-world condition.
                deviceReportedStatus: diag.status || null,
              },
            });
          },
        );
      });
    });
  }
}
