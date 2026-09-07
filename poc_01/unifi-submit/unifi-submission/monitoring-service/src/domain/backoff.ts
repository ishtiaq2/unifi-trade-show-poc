export interface BackoffConfig {
  baseMs: number;
  /** Total attempts per check cycle, including the first. */
  maxAttempts: number;
  maxDelayMs: number;
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  baseMs: 200,
  // Bounded, not infinite: one badly-behaved device must not be able to
  // monopolise the poller and starve every other device's check.
  maxAttempts: 3,
  maxDelayMs: 5_000,
};

/**
 * Exponential backoff with full jitter for a zero-indexed attempt.
 *
 * Full jitter (uniform 0..delay) rather than a fixed delay: if many
 * devices fail simultaneously — which is exactly what a flaky venue
 * network causes — fixed delays would make every retry land on the same
 * tick, converting one network blip into a synchronised thundering herd.
 */
export function backoffDelayMs(
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF,
): number {
  const ceiling = Math.min(config.baseMs * 2 ** attempt, config.maxDelayMs);
  return Math.random() * ceiling;
}
