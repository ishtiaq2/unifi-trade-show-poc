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
 * Failures accumulate to avoid false alarms on unstable networks.
 * A successful check immediately restores the device to reachable.
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
