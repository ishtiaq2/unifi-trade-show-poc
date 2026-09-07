import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
  DeviceNotFoundError,
  DuplicateDeviceError,
  MonitoringService,
} from "../service/monitoringService";
import type { Logger } from "../domain/logger";

const registerDeviceSchema = z.object({
  name: z.string().min(1),
  // host:port. Deliberately not a URL: the address is protocol-agnostic
  // until capability discovery decides whether it is REST or gRPC.
  address: z.string().min(1),
});

export function createApp(service: MonitoringService, log: Logger) {
  const app = express();
  app.use(express.json());

  /** Liveness for whatever hosts this at the venue. Touches nothing. */
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  /** The brief's "API to retrieve the latest status of all monitored devices". */
  app.get("/devices", async (_req, res, next) => {
    try {
      res.json(await service.listDevices());
    } catch (err) {
      next(err);
    }
  });

  app.get("/devices/:id", async (req, res, next) => {
    try {
      res.json(await service.getDeviceWithDiagnostics(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  /**
   * The brief's "device list will change, so it should be easy to update
   * dynamically without restarting" — registration and removal are API
   * operations against the same store the status API reads, so there is
   * exactly one source of truth and no config file to reload.
   */
  app.post("/devices", async (req, res, next) => {
    const parsed = registerDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
      return;
    }
    try {
      res.status(201).json(await service.registerDevice(parsed.data));
    } catch (err) {
      next(err);
    }
  });

  app.delete("/devices/:id", async (req, res, next) => {
    try {
      await service.removeDevice(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown endpoint" } });
  });

  // One place decides HTTP status for each domain error. Scattering that
  // across handlers is how a 404 accidentally becomes a 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DeviceNotFoundError) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
      return;
    }
    if (err instanceof DuplicateDeviceError) {
      res.status(409).json({ error: { code: "DUPLICATE_DEVICE", message: err.message } });
      return;
    }
    log.error("unhandled error", { error: String(err) });
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Unexpected error" },
    });
  });

  return app;
}
