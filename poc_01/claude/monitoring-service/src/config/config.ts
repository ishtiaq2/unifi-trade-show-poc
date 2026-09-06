export interface Config {
  port: number;
  databaseUrl: string;
  pollIntervalMs: number;
  failureThreshold: number;
}

/**
 * Every "this depends on real-world conditions nobody described" value
 * from docs/assumptions.md is a config value here, not a hardcoded
 * constant buried in the poller — that's the actual point of writing
 * assumptions.md in the first place.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl:
      env.DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc",
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 10_000),
    failureThreshold: Number(env.FAILURE_THRESHOLD ?? 3),
  };
}
