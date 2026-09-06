import type { DeviceStatus } from "./types.js";

export interface StateMachineConfig {
  /** Consecutive failures before a device moves from suspect to down. */
  failureThreshold: number;
}

export const DEFAULT_CONFIG: StateMachineConfig = {
  // A default, not a constant — the "right" number depends on network
  // conditions nobody described (docs/assumptions.md #4). Overridable via
  // FAILURE_THRESHOLD env var, see src/config/config.ts.
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
 * The one piece of business logic directly answering "unstable networks,
 * don't want false alarms": a single failure never marks a device down.
 * A device only reaches `down` after `failureThreshold` consecutive
 * failures. Any single success resets it to `reachable` immediately —
 * recovery isn't gated the way failure is (see docs/assumptions.md #4 for
 * why that asymmetry is deliberate).
 *
 * Pure function, no I/O, no clock — trivially testable and reusable by
 * both the poller and any future backfill/replay tooling.
 */
export function transition(input: TransitionInput): TransitionResult {
  const config = input.config ?? DEFAULT_CONFIG;

  if (input.checkSucceeded) {
    return { status: "reachable", consecutiveFailures: 0 };
  }

  const consecutiveFailures = input.consecutiveFailures + 1;
  const status: DeviceStatus =
    consecutiveFailures >= config.failureThreshold ? "down" : "suspect";

  return { status, consecutiveFailures };
}
