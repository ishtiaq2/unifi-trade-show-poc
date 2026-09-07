import * as grpc from "@grpc/grpc-js";
import { createGrpcDevice } from "./grpc-simulator";
import { resolvePort, type DeviceProfile } from "./types";

/**
 * Starts a gRPC device simulator. Binds to 0.0.0.0 rather than localhost
 * so the server is reachable from outside its container — binding to
 * localhost inside a container makes it unreachable via published ports,
 * which is a genuinely easy mistake to make and a confusing one to debug.
 */
export function startGrpcDevice(profile: DeviceProfile): void {
  const server = createGrpcDevice(profile);
  const port = resolvePort(profile);
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err: Error | null) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log(`[${profile.name}] gRPC device simulator listening on :${port}`);
    },
  );
}
