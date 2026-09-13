// unifi-products-demo/src/monitoring-service/config/config.ts

export interface Config {
  port: number;
  databaseUrl: string;
  pollIntervalMs: number;
  failureThreshold: number;
  /**
   * Path to the external checksum binary. Null when unset, which is
   * the current normal state — the binary doesn't exist yet, and the
   * service runs correctly without it (checksums are simply null).
   * See src/checksum/checksumFactory.ts.
   */
  checksumBinaryPath: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc",
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 10_000),
    failureThreshold: Number(env.FAILURE_THRESHOLD ?? 3),
    // `|| null` rather than `?? null` on purpose: an empty-string env
    // var (CHECKSUM_BINARY_PATH=) should mean "not configured", not
    // "run the binary at path ''". `??` would let "" through.
    checksumBinaryPath: env.CHECKSUM_BINARY_PATH || null,
  };
}
