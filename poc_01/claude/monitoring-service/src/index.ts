import pg from "pg";
import { loadConfig } from "./config/config.js";
import { DeviceRepository } from "./repo/deviceRepository.js";
import { MonitoringService } from "./service/monitoringService.js";
import { StubChecksumProvider } from "./checksum/ChecksumProvider.js";
import { Poller } from "./poller/poller.js";
import { createApp } from "./http/app.js";

/**
 * Real startup/shutdown sequence: config -> DB connection -> repo/service
 * wiring -> poller start -> HTTP listen, and the reverse on shutdown.
 * This is the exact sequence docs/assumptions.md #1 says the life-cycle
 * test must boot through for real, rather than mocking any of these
 * layers out.
 */
export async function start() {
  const config = loadConfig();

  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  await pool.query("SELECT 1"); // fail fast if the DB isn't reachable

  const repo = new DeviceRepository(pool);
  const service = new MonitoringService(repo);
  const checksumProvider = new StubChecksumProvider();

  const poller = new Poller(repo, checksumProvider, {
    intervalMs: config.pollIntervalMs,
    stateMachineConfig: { failureThreshold: config.failureThreshold },
  });
  poller.start();

  const app = createApp(service);
  const server = app.listen(config.port, () => {
    console.log(`monitoring-service listening on :${config.port}`);
  });

  async function shutdown() {
    console.log("shutting down...");
    poller.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
    console.log("shutdown complete");
  }

  process.on("SIGTERM", () => shutdown().then(() => process.exit(0)));
  process.on("SIGINT", () => shutdown().then(() => process.exit(0)));

  return { app, server, pool, poller, shutdown };
}

// Only auto-start when run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error("failed to start:", err);
    process.exit(1);
  });
}
