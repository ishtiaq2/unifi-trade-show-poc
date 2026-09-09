import { Pool } from "pg";
import type { Server } from "http";
import { loadConfig } from "./config/config";
import { logger } from "./domain/logger";
import { SQLService } from "../../datasource-module/datasource/sql-service";
import { MonitoringService } from "./service/monitoringService";
import { createApp } from "./http/app";

export interface RunningService {
  server: Server;
  pool: Pool;
  shutdown: () => Promise<void>;
}

export async function start(): Promise<RunningService> {
  const config = loadConfig();

  const pool = new Pool({ connectionString: config.databaseUrl });
  // Fail fast and loudly: a service that starts happily without its
  // database, then reports nothing, is worse than one that refuses to
  // start.
  await pool.query("SELECT 1");

  const sql = new SQLService(pool);
  const service = new MonitoringService(sql, logger);
  const app = createApp(service, logger);

  const server: Server = app.listen(config.port, () => {
    logger.info("rest service started", { port: config.port });
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down");
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
