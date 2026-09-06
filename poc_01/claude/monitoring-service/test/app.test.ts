import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import pg from "pg";
import { DeviceRepository } from "../src/repo/deviceRepository.js";
import { MonitoringService } from "../src/service/monitoringService.js";
import { createApp } from "../src/http/app.js";

/**
 * Runs against a REAL Postgres (poc_test), not a mocked repository —
 * this is the layer where a query bug would actually hide from a purely
 * mocked test suite. Uses the same schema (db/init.sql) the real service
 * runs against, not a hand-simplified test schema that could drift from
 * reality.
 */
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc_test";

describe("HTTP API (against real Postgres)", () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await pool.query("TRUNCATE devices, diagnostics RESTART IDENTITY CASCADE");
    const repo = new DeviceRepository(pool);
    const service = new MonitoringService(repo);
    app = createApp(service);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("starts with an empty device list", async () => {
    const res = await request(app).get("/devices");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("registers a device even when capability discovery fails (device unreachable)", async () => {
    // No device is actually listening on this port — this specifically
    // tests the "still create the device, protocol stays null" path
    // documented in monitoringService.registerDevice.
    const res = await request(app)
      .post("/devices")
      .send({ name: "unreachable-1", address: "localhost:59999" });

    expect(res.status).toBe(201);
    expect(res.body.protocol).toBeNull();
  });

  it("400s on an invalid registration payload instead of a raw 500", async () => {
    const res = await request(app).post("/devices").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("404s when fetching a device that doesn't exist", async () => {
    const res = await request(app).get("/devices/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("404s when deleting a device that doesn't exist", async () => {
    const res = await request(app).delete("/devices/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("registers then deletes a device, and it's gone from the list", async () => {
    const created = await request(app)
      .post("/devices")
      .send({ name: "temp-device", address: "localhost:59998" });
    expect(created.status).toBe(201);

    const del = await request(app).delete(`/devices/${created.body.id}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/devices");
    expect(list.body.find((d: { id: string }) => d.id === created.body.id)).toBeUndefined();
  });

  it("/healthz responds without touching the database", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
