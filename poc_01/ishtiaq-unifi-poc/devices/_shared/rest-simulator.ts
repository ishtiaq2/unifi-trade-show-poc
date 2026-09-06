/**
 * Generic REST device simulator, driven entirely by a profile object.
 *
 * This exists as ONE implementation shared by every REST-backed device
 * folder (router, switch, camera-rest, door-access-rest) — the per-device
 * folders only supply a profile (identity, diagnostics values, failure
 * behavior), not their own copy of server logic. Six near-identical
 * Express apps would be six places to fix the same bug later.
 *
 * Endpoints, matching what the monitoring service is specified to call:
 *   GET /health       → capability discovery (protocol, supported fields)
 *   GET /diagnostics   → HW/SW/FW version + status; checksum omitted here,
 *                        since the real checksum generator doesn't exist
 *                        yet (see poc's docs/assumptions.md #3) — the
 *                        monitoring service is expected to fill that in
 *                        itself via its ChecksumProvider seam, not read
 *                        one from the device.
 *
 * Failure simulation:
 *   profile.failureMode:
 *     "none"       — always succeeds (default)
 *     "flaky"      — fails with probability profile.failureRate per
 *                    request, then recovers — simulates an unstable
 *                    network link, not a broken device
 *     "goes-down"  — succeeds for profile.healthyRequests requests, then
 *                    fails on every request after that — simulates a
 *                    device that's actually, permanently down
 */
import express, { Application, Request, Response } from "express";

// Define the exact shape and allowed values for a device profile
export interface DeviceProfile {
  name: string;
  port: number;
  hwVersion: string;
  swVersion: string;
  fwVersion: string;
  failureMode?: "none" | "flaky" | "goes-down";
  failureRate?: number;
  healthyRequests?: number;
  reportedStatus?: string;
}

/**
 * Generic REST device simulator, driven entirely by a profile object.
 *
 * Endpoints:
 *   GET /health       → capability discovery
 *   GET /diagnostics  → HW/SW/FW version + status
 */
export function createRestDevice(profile: DeviceProfile): Application {
  const app = express();
  let requestCount = 0;

  function shouldFail(): boolean {
    requestCount += 1;
    if (profile.failureMode === "flaky") {
      return Math.random() < (profile.failureRate ?? 0.3);
    }
    if (profile.failureMode === "goes-down") {
      return requestCount > (profile.healthyRequests ?? 5);
    }
    return false;
  }

  app.get("/health", (req: Request, res: Response): void => {
    if (shouldFail()) {
      res.status(503).json({ error: "unavailable" });
      return;
    }

    res.json({
      protocol: "rest",
      capabilities: ["diagnostics"],
      deviceName: profile.name,
    });
  });

  app.get("/diagnostics", (req: Request, res: Response): void => {
    if (shouldFail()) {
      res.status(503).json({ error: "unavailable" });
      return;
    }

    res.json({
      hwVersion: profile.hwVersion,
      swVersion: profile.swVersion,
      fwVersion: profile.fwVersion,
      status: profile.reportedStatus ?? "ok",
    });
  });

  return app;
}
