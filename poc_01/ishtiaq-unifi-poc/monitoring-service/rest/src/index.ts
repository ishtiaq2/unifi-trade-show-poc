// ishtiaq-unifi-poc/monitoring-service/rest/src/index.ts

/**
 *
 * Service entry point. Wires together:
 - config, Postgres pool, repository (SQLService), the business-logic layer (MonitoringService),
 - and the HTTP layer (Express app from createApp), then starts listening.

 Also owns the process lifecycle: refuses to start if the database isn't
 reachable, and registers a graceful shutdown handler for SIGTERM/SIGINT
 so the container can be stopped cleanly (e.g. by `docker/podman stop`
 or an orchestrator) without dropping in-flight requests or leaving the
 pg pool open.
 */

import { Pool } from "pg";
import type { Server } from "http";
import { loadConfig } from "./config/config";
import { logger } from "./domain/logger";
import { SQLService } from "../../datasource-module/datasource/sql-service";
import { MonitoringService } from "./service/monitoringService";
import { Poller } from "./poller/poller";
import { createApp } from "./http/app";
import { createChecksumProvider } from "./checksum/checksumFactory";
import { closeClients } from "./clients/clientFactory";

export interface RunningService {
  server: Server;
  pool: Pool;
  shutdown: () => Promise<void>;
}

export async function start(): Promise<RunningService> {

  // port and databaseUrl
  const config = loadConfig();

  // Persistent pg connection. connectionsString: [host, port, user, and password]
  // default: postgres://poc:poc@unifi-db:5432/poc
  const pool = new Pool({ connectionString: config.databaseUrl });
  // Fail fast and loudly: a service that starts happily without its
  // database, then reports nothing, is worse than one that refuses to
  // start.
  await pool.query("SELECT 1");

  const sql = new SQLService(pool);
  const service = new MonitoringService(sql, logger);
  const checksumProvider = createChecksumProvider(config.checksumBinaryPath, logger);
  const poller = new Poller(
    sql,
    logger,
    config.pollIntervalMs,
    { failureThreshold: config.failureThreshold },
    checksumProvider,
  );
  poller.start();

  const app = createApp(service, logger);

  const server: Server = app.listen(config.port, () => {
    logger.info("rest service started", { port: config.port });
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down");
    poller.stop();
    closeClients();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
    logger.info("shutdown complete");
  };

  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));

  return { server, pool, shutdown };
}

if (require.main === module) {
  start().catch((error) => {
    logger.error("failed to start", { error: String(error) });
    process.exit(1);
  });
}
