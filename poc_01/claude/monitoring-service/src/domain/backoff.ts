export interface BackoffConfig {
  baseMs: number;
  maxAttempts: number;
  maxDelayMs: number;
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  baseMs: 200,
  maxAttempts: 3, // bounded: one flaky device can't monopolize poller capacity
  maxDelayMs: 5000,
};

/**
 * Exponential backoff with jitter for attempt `n` (0-indexed). Jitter
 * (full random 0..delay, not +/- a fixed amount) avoids every retry of
 * every device lining up on the same tick if many devices fail at once.
 */
export function backoffDelayMs(attempt: number, config: BackoffConfig = DEFAULT_BACKOFF): number {
  const exp = Math.min(config.baseMs * 2 ** attempt, config.maxDelayMs);
  return Math.random() * exp;
}
