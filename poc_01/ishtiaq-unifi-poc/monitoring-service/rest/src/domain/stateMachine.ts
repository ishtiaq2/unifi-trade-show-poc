// monitoring-service/rest/src/domain/stateMachine.ts

import type { DeviceStatus } from "../../../datasource-module/domain/types";

export interface StateMachineConfig {
  /** Consecutive failed checks before a device is declared down. */
  failureThreshold: number;
}

/**
 * A default, not a hardcoded constant. The "right" number depends on
 * network conditions nobody has described yet — a venue with flaky
 * wifi needs a higher threshold than a wired office. Step 7's poller
 * reads this from an environment variable (FAILURE_THRESHOLD), so it
 * can be tuned on-site without a code change or redeploy.
 */
export const DEFAULT_CONFIG: StateMachineConfig = {
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
 * behind unstable networks... we don't want false alarms."
 *
 * A failure never immediately means "down". Failures accumulate through
 * `suspect` and only reach `down` once they exceed the configured
 * threshold. Any single success resets to `reachable` immediately,
 * from ANY prior state — including straight from `down`.
 *
 * That asymmetry is deliberate, not an oversight: falsely reporting a
 * healthy device as down in front of a customer is far more costly
 * than briefly continuing to show a just-recovered device as
 * `suspect` for one extra check. Failure is treated as a claim that
 * needs evidence, accumulated over multiple checks; recovery is
 * trusted the first time it's seen.
 *
 * Pure function: no clock, no I/O, no database, no network — every
 * input it needs is a parameter, and every output is a return value.
 * This is what makes it possible to test exhaustively in milliseconds,
 * and what makes it "step 6" rather than folded into step 7's poller:
 * the decision logic and the scheduling/retry mechanics are genuinely
 * separable concerns, and keeping them separate means a bug in one
 * can never hide inside a bug in the other.
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
