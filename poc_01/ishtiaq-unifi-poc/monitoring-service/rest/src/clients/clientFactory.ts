import type { Protocol } from "../../../datasource-module/domain/types";
import type { DeviceClient } from "./DeviceClient";
import { RestDeviceClient } from "./RestDeviceClient";

const restClient = new RestDeviceClient();

export function clientFor(protocol: Protocol): DeviceClient {
  switch (protocol) {
    case "rest":
      return restClient;
    case "grpc":
      // Step 8 adds GrpcDeviceClient here. Thrown deliberately rather
      // than silently returning the REST client for a gRPC device,
      // which would fail in a much more confusing way further down.
      throw new Error("gRPC devices are not supported until step 8");
  }
}

/**
 * Used before a device's protocol is known, per the brief's "use its
 * health endpoint to get the capabilities".
 *
 * REST only for now — this is the entire reason discoverProtocol is a
 * separate function from a hardcoded `restClient.discoverCapabilities`
 * call: step 8 adds a try/catch fallback to gRPC here, and nothing
 * calling this function needs to change when that happens.
 */
export async function discoverProtocol(
  address: string,
): Promise<{ protocol: Protocol; capabilities: unknown }> {
  const capabilities = await restClient.discoverCapabilities(address);
  return { protocol: "rest", capabilities };
}
