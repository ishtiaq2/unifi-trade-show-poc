import type { DeviceStatus } from "./types";

export interface StateMachineConfig {
  /** Consecutive failed checks before a device is declared down. */
  failureThreshold: number;
}

export const DEFAULT_STATE_CONFIG: StateMachineConfig = {
  // A default, not a constant. The right value depends on network
  // conditions nobody has described yet, so it is configurable via
  // FAILURE_THRESHOLD (see src/config/config.ts) and can be tuned at the
  // venue without a code change.
  failureThreshold: 3,
};

export interface TransitionInput {
  currentStatus: DeviceStatus;
  consecutiveFailures: number;
  checkSucceeded: boolean;
  config?: StateMachineConfig;
}

export interface TransitionResult {
  status: DeviceStatus;
  consecutiveFailures: number;
}

/**
 * The single piece of logic that answers the brief's "some devices are
 * behind unstable networks... we don't want false alarms".
 *
 * A failure never immediately means "down". Failures accumulate through
 * `suspect` and only reach `down` once they exceed the threshold. Any
 * single success resets to `reachable` immediately.
 *
 * That asymmetry is deliberate: falsely reporting a healthy device as
 * down in front of a customer is far more costly than briefly continuing
 * to show a recovered device as suspect. Failure is treated as a claim
 * requiring evidence; recovery is trusted on first sight.
 *
 * Pure function: no clock, no I/O, no database. Trivial to test
 * exhaustively, and reusable by anything that needs to replay history.
 */
export function transition(input: TransitionInput): TransitionResult {
  const config = input.config ?? DEFAULT_STATE_CONFIG;

  if (input.checkSucceeded) {
    return { status: "reachable", consecutiveFailures: 0 };
  }

  const consecutiveFailures = input.consecutiveFailures + 1;
  const status: DeviceStatus =
    consecutiveFailures >= config.failureThreshold ? "down" : "suspect";

  return { status, consecutiveFailures };
}
