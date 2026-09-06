import type { HealthCheckResult, Protocol } from "../domain/types.js";

export interface Capabilities {
  protocol: Protocol;
  capabilities: string[];
  deviceName: string;
}

/**
 * The seam the brief explicitly asked for: everything above this
 * interface (the poller, the service layer) talks to a device without
 * knowing or caring whether it's REST or gRPC. Adding a third protocol
 * later means writing one new implementation of this interface, not
 * touching the poller or service layer at all.
 */
export interface DeviceClient {
  /** Queries the device's health endpoint to discover its capabilities. */
  discoverCapabilities(address: string): Promise<Capabilities>;
  /** A single health/diagnostics check. Never throws for a down device —
   *  a failed check is `{ ok: false }`, not an exception; exceptions are
   *  reserved for programmer error, not expected device unavailability. */
  checkHealth(address: string): Promise<HealthCheckResult>;
}
