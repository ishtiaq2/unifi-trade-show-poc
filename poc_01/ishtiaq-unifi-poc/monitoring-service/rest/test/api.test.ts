import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { SQLService } from "../../datasource-module/datasource/sql-service";
import { MonitoringService } from "../src/service/monitoringService";
import { createApp } from "../src/http/app";
import { silentLogger } from "../src/domain/logger";

/**
 * Runs against a REAL Postgres, not a mocked SQLService — a mock could
 * only confirm the code calls the methods the test expects, not catch
 * a malformed query or a constraint that doesn't behave as assumed.
 */
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc_test";

describe("REST API (step 4)", () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query("TRUNCATE devices, diagnostics RESTART IDENTITY CASCADE");
    const sql = new SQLService(pool);
    app = createApp(new MonitoringService(sql, silentLogger), silentLogger);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reports healthy without touching the database", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("starts with no devices", async () => {
    const res = await request(app).get("/devices");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("registers a device even when its address is unreachable, protocol stays null", async () => {
    // "router:4001" resolves to nothing in this test's environment — no
    // real device is running here. Discovery is expected to fail, and
    // registration must still succeed with protocol left null rather
    // than rejecting outright. See test/discovery.test.ts for the
    // matching case where a real device IS running and discovery
    // actually succeeds through this same endpoint.
    const res = await request(app)
      .post("/devices")
      .send({ name: "router-1", address: "router:4001" });
    expect(res.status).toBe(201);
    expect(res.body.protocol).toBeNull();
    expect(res.body.status).toBe("reachable");
  });

  it("400s on an invalid payload", async () => {
    const res = await request(app).post("/devices").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("409s on a duplicate address, and does not create a second row", async () => {
    await request(app).post("/devices").send({ name: "a", address: "dup:1" });
    const res = await request(app).post("/devices").send({ name: "b", address: "dup:1" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_DEVICE");

    const list = await request(app).get("/devices");
    expect(list.body).toHaveLength(1);
  });

  it("404s for an unknown device on GET and DELETE", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    const get = await request(app).get(`/devices/${missing}`);
    expect(get.status).toBe(404);
    const del = await request(app).delete(`/devices/${missing}`);
    expect(del.status).toBe(404);
  });

  it("full lifecycle: register, list, get with diagnostics shape, delete, confirm gone", async () => {
    const created = await request(app)
      .post("/devices")
      .send({ name: "switch-1", address: "switch:4002" });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const listed = await request(app).get("/devices");
    expect(listed.body).toHaveLength(1);

    const got = await request(app).get(`/devices/${id}`);
    expect(got.status).toBe(200);
    expect(got.body.device.id).toBe(id);
    expect(got.body.diagnostics).toBeNull(); // no poller yet — step 4 doesn't record any

    const deleted = await request(app).delete(`/devices/${id}`);
    expect(deleted.status).toBe(204);

    const after = await request(app).get("/devices");
    expect(after.body).toHaveLength(0);
  });

  it("404s JSON (not HTML) for an unknown route", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
