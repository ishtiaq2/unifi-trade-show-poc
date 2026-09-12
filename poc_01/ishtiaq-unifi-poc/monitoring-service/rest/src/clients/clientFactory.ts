import type { Protocol } from "../../../datasource-module/domain/types";
import type { DeviceClient } from "./DeviceClient";
import { RestDeviceClient } from "./RestDeviceClient";
import { GrpcDeviceClient } from "./GrpcDeviceClient";

const restClient = new RestDeviceClient();
const grpcClient = new GrpcDeviceClient();

export function clientFor(protocol: Protocol): DeviceClient {
  switch (protocol) {
    case "rest":
      return restClient;
    case "grpc":
      return grpcClient;
  }
}

/**
 * Used before a device's protocol is known, per the brief's "use its
 * health endpoint to get the capabilities".
 *
 * Tries REST first, then falls back to gRPC. The order is arbitrary
 * but not meaningless: REST is tried first only because it's the
 * cheaper failure — an HTTP request to a gRPC port fails fast on a
 * protocol mismatch, whereas the reverse can sit waiting for the
 * deadline. Nothing depends on the order being REST-first; it just
 * makes the common case slightly faster.
 *
 * A device that answers NEITHER throws, and the caller decides what
 * that means:
 *   - registerDevice (rest) catches it and creates the device anyway
 *     with protocol null, so gear can be added while still booting.
 *   - the poller catches it and records a reachable:false reading,
 *     then retries discovery on the next cycle.
 * Both behaviors predate this change and are unaffected by it — which
 * is the point of discovery having been a separate function all along.
 */
export async function discoverProtocol(
  address: string,
): Promise<{ protocol: Protocol; capabilities: unknown }> {
  try {
    const capabilities = await restClient.discoverCapabilities(address);
    return { protocol: "rest", capabilities };
  } catch {
    // REST didn't answer — try gRPC before giving up. If this throws
    // too, it propagates to the caller, exactly as a total failure did
    // before gRPC support existed.
    const capabilities = await grpcClient.discoverCapabilities(address);
    return { protocol: "grpc", capabilities };
  }
}

/**
 * Releases client resources. Only gRPC holds anything that needs
 * explicit cleanup — grpc-js keeps event loop handles open per channel,
 * which prevents a clean process exit on SIGTERM if left dangling.
 * RestDeviceClient uses fetch and has nothing to close.
 */
export function closeClients(): void {
  grpcClient.close();
}
