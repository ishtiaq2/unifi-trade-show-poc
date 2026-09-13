// unifi-products-demo/src/devices/01-rest/common/rest-simulator.ts

/**
 * Generic REST device simulator, driven entirely by a profile object.
 *
 * Endpoints, matching what the monitoring service is specified to call:
 *   GET /health       → capability discovery (protocol, supported fields)
 *   GET /diagnostics  → HW, SW, FW, status.
 */

import express, { Application, Request, Response } from "express";
import type { DeviceProfile } from "../../shared/types";

export type { DeviceProfile };

export function createRestDevice(profile: DeviceProfile): Application {
  const app = express();
  let requestCount = 0;

  function shouldFail(): boolean {
    requestCount += 1;
    if (profile.failureMode === "flaky") {
      return Math.random() < (profile.failureRate ?? 0.15);
    }
    if (profile.failureMode === "goes-down") {
      // Note: counts REQUESTS, not monitoring-service check cycles. One
      // cycle issues two requests (/health + /diagnostics), so a device
      // with healthyRequests: 8 survives roughly 4 poll cycles.
      return requestCount > (profile.healthyRequests ?? 5);
    }
    return false;
  }

  app.get("/health", (_req: Request, res: Response): void => {
    if (shouldFail()) {
      res.status(503).json({ error: "unavailable" });
      return;
    }
    res.json({
      protocol: "rest",
      capabilities: ["diagnostics-ts"],
      deviceName: profile.name,
    });
  });

  app.get("/diagnostics", (_req: Request, res: Response): void => {
    if (shouldFail()) {
      res.status(503).json({ error: "unavailable ts" });
      return;
    }
    res.json({
      name: profile.name,
      hwVersion: profile.hwVersion,
      swVersion: profile.swVersion,
      fwVersion: profile.fwVersion,
      status: profile.reportedStatus ?? "ok",
    });
  });

  return app;
}
