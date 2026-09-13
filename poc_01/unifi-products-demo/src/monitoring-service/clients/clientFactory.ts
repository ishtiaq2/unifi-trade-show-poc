import type { HealthCheckResult, Protocol } from "../datasource-module/models/types";
import { RestDeviceClient } from "./RestDeviceClient";
import { GrpcDeviceClient } from "./GrpcDeviceClient";

export interface Capabilities {
  protocol: Protocol;
  capabilities: string[];
  deviceName: string;
}

/**
 * Lets the service talk to a device without knowing whether it's REST
 * or gRPC.
 *
 * Note the deliberate asymmetry: discoverCapabilities THROWS on
 * failure (registration can't proceed without knowing what a device
 * is), while checkHealth returns `{ ok: false }` instead. An
 * unreachable device is a routine outcome for a health check, and
 * pushing that through catch blocks in the poller would be wrong.
 */
export interface DeviceClient {
  discoverCapabilities(address: string): Promise<Capabilities>;
  checkHealth(address: string): Promise<HealthCheckResult>;
}

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
 * Used before a device's protocol is known.
 *
 * REST is tried first only because it's the cheaper failure: an HTTP
 * request to a gRPC port fails fast, whereas the reverse waits for the
 * deadline. Nothing depends on the order.
 *
 * Throws if a device answers neither. Callers decide what that means —
 * registerDevice creates the device anyway with protocol null (gear
 * gets added while still booting), and the poller retries next cycle.
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
