import type { Protocol } from "../domain/types.js";
import type { DeviceClient } from "./DeviceClient.js";
import { RestDeviceClient } from "./RestDeviceClient.js";
import { GrpcDeviceClient } from "./GrpcDeviceClient.js";

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
 * Used only during capability discovery, before a device's protocol is
 * known. Tries REST first (the brief's primary, required protocol),
 * falls back to gRPC — rather than requiring the caller to already know
 * what it's trying to discover.
 */
export async function discoverProtocol(
  address: string,
): Promise<{ protocol: Protocol; capabilities: unknown }> {
  try {
    const caps = await restClient.discoverCapabilities(address);
    return { protocol: "rest", capabilities: caps };
  } catch {
    const caps = await grpcClient.discoverCapabilities(address);
    return { protocol: "grpc", capabilities: caps };
  }
}
