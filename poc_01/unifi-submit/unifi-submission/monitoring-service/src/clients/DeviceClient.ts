import type { HealthCheckResult, Protocol } from "../domain/types";

export interface Capabilities {
  protocol: Protocol;
  capabilities: string[];
  deviceName: string;
}

/**
 * The seam the brief asks for when it says diagnostics are retrieved
 * "depending on protocol the device supports".
 *
 * Everything above this interface — the poller, the service layer — is
 * written without knowing whether a device speaks REST or gRPC. Adding a
 * third protocol means writing one new implementation of this interface
 * and one line in the factory; no other file changes.
 */
export interface DeviceClient {
  /**
   * Queries the device's health endpoint to discover what it supports.
   * Throws on failure: discovery failing is exceptional (we cannot
   * proceed without it), unlike a routine health check failing.
   */
  discoverCapabilities(address: string): Promise<Capabilities>;

  /**
   * A single health + diagnostics check.
   *
   * Never throws for an unreachable device — an unreachable device is an
   * expected, routine outcome, and returns `{ ok: false }`. Exceptions
   * here would mean programmer error, and treating "device is offline"
   * as an exception would push routine control flow through catch
   * blocks in the poller.
   */
  checkHealth(address: string): Promise<HealthCheckResult>;
}
