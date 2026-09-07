import type { Protocol } from "../domain/types";
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
 * Used before a device's protocol is known, implementing the brief's
 * "use its health endpoint to get the capabilities".
 *
 * Tries REST first because it is the brief's required protocol (gRPC is
 * "ideally"), then falls back to gRPC. The caller does not have to know
 * in advance what it is discovering — which is the point of discovery.
 */
export async function discoverProtocol(
  address: string,
): Promise<{ protocol: Protocol; capabilities: unknown }> {
  try {
    const capabilities = await restClient.discoverCapabilities(address);
    return { protocol: "rest", capabilities };
  } catch {
    const capabilities = await grpcClient.discoverCapabilities(address);
    return { protocol: "grpc", capabilities };
  }
}
