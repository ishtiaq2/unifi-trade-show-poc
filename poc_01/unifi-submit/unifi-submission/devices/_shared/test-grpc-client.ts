/**
 * Standalone gRPC client for manually poking the gRPC device simulators.
 * curl and browsers can't talk to them (HTTP/2 + protobuf framing), so
 * this fills the same role curl does for the REST devices.
 *
 *   npx ts-node _shared/test-grpc-client.ts localhost:4005
 */
import * as grpc from "@grpc/grpc-js";
import { loadDeviceProto } from "./grpc-simulator";

const target = process.argv[2] ?? "localhost:4005";
const deviceProto = loadDeviceProto();
const client = new deviceProto.DeviceService(target, grpc.credentials.createInsecure());

client.getHealth({}, (err: grpc.ServiceError | null, res: unknown) => {
  if (err) {
    console.error("getHealth error:", err.message);
    process.exit(1);
  }
  console.log("health:", res);
  client.getDiagnostics({}, (err2: grpc.ServiceError | null, res2: unknown) => {
    if (err2) {
      console.error("getDiagnostics error:", err2.message);
      process.exit(1);
    }
    console.log("diagnostics:", res2);
    process.exit(0);
  });
});
