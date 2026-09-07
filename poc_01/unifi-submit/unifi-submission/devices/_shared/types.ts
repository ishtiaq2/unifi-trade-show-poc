/**
 * Shared profile type for every device simulator, REST and gRPC alike.
 *
 * Lives in its own module rather than inside rest-simulator.ts so that
 * gRPC device folders don't have to import from the REST implementation
 * just to type their own config — the profile shape is a contract both
 * transports depend on, not something either one owns.
 */
export interface DeviceProfile {
  name: string;
  port: number;
  hwVersion: string;
  swVersion: string;
  fwVersion: string;

  /**
   * "none"       — always succeeds (default)
   * "flaky"      — fails with probability `failureRate` per REQUEST;
   *                simulates an unstable network link, not a broken
   *                device. See the note on compounding below.
   * "goes-down"  — succeeds for `healthyRequests` requests, then fails
   *                on every request after; simulates a genuinely dead
   *                device.
   */
  failureMode?: "none" | "flaky" | "goes-down";

  /**
   * Per-REQUEST failure probability for "flaky" mode.
   *
   * IMPORTANT — this compounds: the monitoring service's checkHealth()
   * calls /health AND /diagnostics, each rolling this independently, so
   * the probability of a whole check failing is 1 - (1 - rate)^2, not
   * `rate`. At rate 0.35 that's a 58% check-failure rate, which (even
   * with retries) produced ~5 false "down" transitions across a
   * simulated two-hour demo — exactly the false alarm the brief warns
   * about. Values at or below 0.15 keep visible "suspect" blips while
   * making a false "down" effectively impossible.
   *
   * A more physically faithful model would decide link state once per
   * check rather than per request — noted as a possible refinement, but
   * a single tuned probability is sufficient for a PoC fixture and
   * keeps this file simple.
   */
  failureRate?: number;

  /** Number of successful requests before "goes-down" mode dies. */
  healthyRequests?: number;

  /**
   * The device's OWN reported health, returned in /diagnostics. Distinct
   * from whether the monitoring service can reach it — a device can be
   * perfectly reachable while reporting a fault about itself. Defaults
   * to "ok" when unset.
   */
  reportedStatus?: string;
}

/**
 * Reads the listen port, allowing an env override so the same image can
 * host a device on a different port without editing its profile — the
 * brief anticipates "a bunch of different devices and operating systems
 * for hosting the service", where fixed ports collide.
 */
export function resolvePort(profile: DeviceProfile): number {
  const override = process.env.PORT;
  return override ? Number(override) : profile.port;
}
