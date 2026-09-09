import type { Protocol } from "../../../datasource-module/domain/types";
import type { DeviceClient } from "./DeviceClient";
import { RestDeviceClient } from "./RestDeviceClient";

// TEMPORARY — proving exactly when this line runs, relative to requests.
console.log(`[clientFactory.ts] module loading — about to build restClient — ${new Date().toISOString()}`);
const restClient = new RestDeviceClient();
console.log(`[clientFactory.ts] restClient built — this happens ONCE, ever — ${new Date().toISOString()}`);

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
  // TEMPORARY — proving discoverProtocol does NOT build a new client.
  console.log(`[clientFactory.ts] discoverProtocol(${address}) called — reusing the restClient built earlier — ${new Date().toISOString()}`);
  const capabilities = await restClient.discoverCapabilities(address);
  return { protocol: "rest", capabilities };
}
