import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { Pool } from "pg";
import { SQLService } from "../../datasource-module/datasource/sql-service";
import { MonitoringService } from "../src/service/monitoringService";
import { createApp } from "../src/http/app";
import { silentLogger } from "../src/domain/logger";

/**
 * The end-to-end proof that step 5's wiring actually works: register a
 * device through the REAL HTTP API, with a REAL device simulator
 * actually running, and confirm the response's protocol field is
 * populated — not asserted at the DeviceClient level in isolation
 * (that's restDeviceClient.test.ts), but through the whole stack a real
 * client would use.
 */
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc_test";
const devicesDir = path.resolve(__dirname, "../../../devices");
const PORT = 4302;

let device: ChildProcess | null = null;

async function waitForHttp(url: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

describe("device discovery through the real HTTP API", () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query("TRUNCATE devices, diagnostics RESTART IDENTITY CASCADE");
    const sql = new SQLService(pool);
    app = createApp(new MonitoringService(sql, silentLogger), silentLogger);
  });

  afterEach(async () => {
    await pool.end();
    if (device?.pid) {
      try {
        process.kill(-device.pid, "SIGKILL");
      } catch {
        device.kill("SIGKILL");
      }
    }
    device = null;
  });

  it("POST /devices resolves a real device's protocol via real discovery", async () => {
    device = spawn(
      "npx",
      [
        "ts-node",
        "-e",
        `
        const { createRestDevice } = require("./_shared/rest-simulator");
        createRestDevice({
          name: "discovery-test-router", hwVersion: "H", swVersion: "S", fwVersion: "F",
          failureMode: "none", port: ${PORT},
        }).listen(${PORT});
      `,
      ],
      { cwd: devicesDir, stdio: "pipe", detached: true },
    );
    await waitForHttp(`http://localhost:${PORT}/health`);

    const res = await request(app)
      .post("/devices")
      .send({ name: "discovery-test-router", address: `localhost:${PORT}` });

    expect(res.status).toBe(201);
    expect(res.body.protocol).toBe("rest");
    expect(res.body.capabilities).toBeTruthy();

    // Confirm it was actually persisted, not just returned in the
    // response — a bug that wrote the response correctly but never
    // called setCapabilities would look identical from the POST alone.
    const fetched = await request(app).get(`/devices/${res.body.id}`);
    expect(fetched.body.device.protocol).toBe("rest");
  }, 15_000);
});
