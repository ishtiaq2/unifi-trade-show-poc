import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { DeviceRepository } from "../src/repo/deviceRepository";
import { MonitoringService } from "../src/service/monitoringService";
import { createApp } from "../src/http/app";
import { silentLogger } from "../src/domain/logger";

/**
 * Runs against a REAL Postgres, not a mocked repository.
 *
 * A mocked repository can only confirm the code calls the methods the
 * test expects — it cannot catch a malformed query, a constraint that
 * does not behave as assumed, or a column name typo, which are the
 * failures that actually happen at this layer. Uses the same
 * db/init.sql the service runs against, so the test schema cannot drift
 * from the real one.
 */
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc_test";

describe("HTTP API", () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query("TRUNCATE devices, diagnostics RESTART IDENTITY CASCADE");
    const repo = new DeviceRepository(pool);
    app = createApp(new MonitoringService(repo, silentLogger), silentLogger);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reports its own health without touching the database", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("starts with no devices", async () => {
    const res = await request(app).get("/devices");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("registers a device that is currently unreachable, leaving protocol pending", async () => {
    // Nothing listens on this port. Registration must still succeed:
    // gear gets added while it is still booting on the show floor.
    const res = await request(app)
      .post("/devices")
      .send({ name: "not-yet-booted", address: "localhost:59999" });

    expect(res.status).toBe(201);
    expect(res.body.protocol).toBeNull();
    expect(res.body.status).toBe("reachable");
  });

  it("rejects a duplicate address with 409 rather than double-monitoring it", async () => {
    await request(app).post("/devices").send({ name: "first", address: "localhost:59998" });
    const res = await request(app)
      .post("/devices")
      .send({ name: "second", address: "localhost:59998" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_DEVICE");
  });

  it("returns 400 for an invalid payload, not 500", async () => {
    const res = await request(app).post("/devices").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for an unknown device", async () => {
    const res = await request(app).get("/devices/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 when deleting an unknown device", async () => {
    const res = await request(app).delete("/devices/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("supports adding and removing devices without a restart", async () => {
    // The brief: "The device list will change, so it should be easy to
    // update dynamically without restarting."
    const created = await request(app)
      .post("/devices")
      .send({ name: "temporary", address: "localhost:59997" });
    expect(created.status).toBe(201);

    const listed = await request(app).get("/devices");
    expect(listed.body).toHaveLength(1);

    const deleted = await request(app).delete(`/devices/${created.body.id}`);
    expect(deleted.status).toBe(204);

    const after = await request(app).get("/devices");
    expect(after.body).toHaveLength(0);
  });

  it("returns 404 JSON for an unknown endpoint rather than HTML", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
