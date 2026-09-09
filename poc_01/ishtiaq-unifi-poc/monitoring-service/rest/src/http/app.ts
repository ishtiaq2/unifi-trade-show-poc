// monitoring-service/rest/src/http/app.ts

import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { DeviceNotFoundError, DuplicateDeviceError, MonitoringService} from "../service/monitoringService";
import type { Logger } from "../domain/logger";

const registerDeviceSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1), // "host:port" — protocol-agnostic until step 5 discovers it
});

export function createApp(service: MonitoringService, log: Logger) {
  const app = express();
  app.use(express.json());

  /** Liveness only — touches nothing, so it answers even if Postgres is down. */
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

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

  // One place decides HTTP status for each domain error, so a 404
  // doesn't accidentally become a 500 from a handler that forgot to
  // check for it.
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
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected error" } });
  });

  return app;
}
