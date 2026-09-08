/**
 * Shared profile type for the gRPC device simulators.
 *
 * A profile is pure configuration — identity, port, and how the device
 * should misbehave. It contains no server logic, which is what lets one
 * `grpc-simulator.ts` implementation back every device folder rather
 * than each folder carrying its own copy.
 */
export interface DeviceProfile {
  name: string;
  port: number;
  hwVersion: string;
  swVersion: string;
  fwVersion: string;

  /**
   * "none"       — always succeeds (default)
   * "flaky"      — fails with probability `failureRate` per RPC;
   *                simulates an unstable network link rather than a
   *                broken device
   * "goes-down"  — succeeds for `healthyRequests` RPCs, then fails on
   *                every RPC after; simulates a device that genuinely
   *                dies and stays dead
   *
   * All three are exercised by `npm run demo` — see README.
   */
  failureMode?: "none" | "flaky" | "goes-down";

  /**
   * Per-RPC failure probability for "flaky" mode.
   *
   * Note this is per RPC, not per health check. A caller that invokes
   * GetHealth and then GetDiagnostics makes two RPCs, so the chance of
   * at least one failing is 1 - (1 - rate)^2 — noticeably higher than
   * `rate` alone. Worth keeping in mind when choosing a value: 0.35
   * per RPC is a ~58% chance of a two-RPC sequence failing.
   */
  failureRate?: number;

  /** Number of successful RPCs before "goes-down" mode dies. */
  healthyRequests?: number;

  /**
   * The device's OWN reported health, returned in GetDiagnostics.
   * Deliberately distinct from whether the device is reachable at all —
   * a device can answer every RPC perfectly while reporting an internal
   * fault about itself. Defaults to "ok" when unset.
   */
  reportedStatus?: string;
}

/**
 * Reads the listen port, allowing a PORT env override so the same image
 * can host a device on a different port without editing its profile.
 */
export function resolvePort(profile: DeviceProfile): number {
  const override = process.env.PORT;
  return override ? Number(override) : profile.port;
}
