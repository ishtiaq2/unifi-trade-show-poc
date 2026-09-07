/**
 * Generic REST device simulator, driven entirely by a profile object.
 *
 * ONE implementation shared by every REST-backed device folder (router,
 * switch, camera-rest, door-access-rest) — the per-device folders only
 * supply a profile, not their own copy of server logic. Six near-identical
 * Express apps would be six places to fix the same bug later.
 *
 * Endpoints, matching what the monitoring service is specified to call:
 *   GET /health       → capability discovery (protocol, supported fields)
 *   GET /diagnostics  → HW/SW/FW version + the device's self-reported
 *                       status. Checksum is deliberately NOT returned
 *                       here: the real checksum generator doesn't exist
 *                       yet (docs/assumptions.md #3), and the monitoring
 *                       service fills it in via its ChecksumProvider
 *                       seam rather than trusting a device to self-report
 *                       a checksum of its own data.
 */
import express, { Application, Request, Response } from "express";
import type { DeviceProfile } from "./types";

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
