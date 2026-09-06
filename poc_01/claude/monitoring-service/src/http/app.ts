import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { MonitoringService, DeviceNotFoundError } from "../service/monitoringService.js";

const registerDeviceSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1), // "host:port" — protocol-agnostic per spec
});

export function createApp(service: MonitoringService) {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

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
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.message },
      });
    }
    try {
      const device = await service.registerDevice(parsed.data);
      res.status(201).json(device);
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

  // Centralized error mapping, consistent error shape — same pattern as
  // unifi-fabrics-ta, per the same reasoning: one place decides HTTP
  // status, not scattered try/catch blocks guessing at status codes.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DeviceNotFoundError) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
    }
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected error" } });
  });

  return app;
}
