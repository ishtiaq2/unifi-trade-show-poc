export interface Config {
  port: number;
  databaseUrl: string;
  pollIntervalMs: number;
  failureThreshold: number;
}

/**
 * Every value that depends on real-world conditions nobody has described
 * is configurable here rather than hardcoded somewhere in the poller.
 *
 * This is a direct consequence of the brief: the venue network is an
 * unknown, and the service must "get up and running quick and easy" on
 * unfamiliar hardware. Tuning the failure threshold on-site must not
 * require editing and redeploying code.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc",
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 10_000),
    failureThreshold: Number(env.FAILURE_THRESHOLD ?? 3),
  };
}
