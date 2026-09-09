import type { HealthCheckResult, Protocol } from "../../../datasource-module/domain/types";

export interface Capabilities {
  protocol: Protocol;
  capabilities: string[];
  deviceName: string;
}

/**
 * The seam that lets the rest of the service talk to a device without
 * knowing or caring whether it's REST or gRPC.
 *
 * Step 5 only implements the REST side (RestDeviceClient). Step 8 adds
 * GrpcDeviceClient as a second implementation of this same interface —
 * nothing above this interface should need to change when that happens,
 * which is the actual point of defining it now rather than hardcoding
 * REST calls directly into the service layer.
 */
export interface DeviceClient {
  /**
   * Queries the device's health endpoint to discover what it supports.
   * Throws on failure — discovery failing is exceptional (registration
   * can't proceed without it), unlike a routine health check failing.
   */
  discoverCapabilities(address: string): Promise<Capabilities>;

  /**
   * A single health + diagnostics check.
   *
   * Never throws for an unreachable device — that's an expected,
   * routine outcome and returns `{ ok: false }`. Exceptions here would
   * mean programmer error; treating "device is offline" as an
   * exception would push routine control flow through catch blocks in
   * whatever calls this (the poller, in step 7).
   */
  checkHealth(address: string): Promise<HealthCheckResult>;
}
