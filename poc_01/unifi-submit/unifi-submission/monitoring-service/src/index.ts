import { Pool } from "pg";
import type { Server } from "http";
import { loadConfig } from "./config/config";
import { logger } from "./domain/logger";
import { DeviceRepository } from "./repo/deviceRepository";
import { MonitoringService } from "./service/monitoringService";
import { StubChecksumProvider } from "./checksum/ChecksumProvider";
import { Poller } from "./poller/poller";
import { createApp } from "./http/app";

export interface RunningService {
  server: Server;
  pool: Pool;
  poller: Poller;
  shutdown: () => Promise<void>;
}

/**
 * The real startup sequence: config → database → wiring → poller → HTTP.
 *
 * Exported rather than inlined so the life-cycle test can boot this exact
 * code path instead of a test-only approximation of it — see
 * docs/assumptions.md #1.
 */
export async function start(): Promise<RunningService> {
  const config = loadConfig();

  const pool = new Pool({ connectionString: config.databaseUrl });
  // Fail fast and loudly. A monitoring service that starts up happily
  // without its database, then reports nothing, is worse than one that
  // refuses to start — at a trade show, silence looks like "working".
  await pool.query("SELECT 1");

  const repo = new DeviceRepository(pool);
  const service = new MonitoringService(repo, logger);
  const poller = new Poller(
    repo,
    new StubChecksumProvider(),
    {
      intervalMs: config.pollIntervalMs,
      stateMachineConfig: { failureThreshold: config.failureThreshold },
    },
    logger,
  );
  poller.start();

  const app = createApp(service, logger);
  const server: Server = app.listen(config.port, () => {
    logger.info("monitoring-service started", {
      port: config.port,
      pollIntervalMs: config.pollIntervalMs,
      failureThreshold: config.failureThreshold,
    });
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down");
    poller.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
    logger.info("shutdown complete");
  };

  // Containers stop with SIGTERM; Ctrl-C sends SIGINT. Both must release
  // the database pool, or repeated restarts during setup at the venue
  // would leak connections until Postgres refuses new ones.
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));

  return { server, pool, poller, shutdown };
}

if (require.main === module) {
  start().catch((error) => {
    logger.error("failed to start", { error: String(error) });
    process.exit(1);
  });
}
