// unifi-products-demo/src/devices/01-rest/common/start-rest.ts

import { createRestDevice } from "./rest-simulator";
import { resolvePort, type DeviceProfile } from "../../shared/types";

/**
 * Starts a REST device simulator. Every REST device folder's index.ts is
 * a one-line call to this, so the listen/log/port-resolution behavior is
 * defined once instead of copy-pasted four times.
 */

export function startRestDevice(profile: DeviceProfile): void {
  const app = createRestDevice(profile);
  // Pretty-prints JSON responses for readable curl/browser output during demos.
  app.set("json spaces", 2);
  const port = resolvePort(profile);
  const server = app.listen(port, () => {
    console.log(`[${profile.name}] REST device simulator listening on :${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[${profile.name}] ${signal} received, closing`);
    server.close(() => process.exit(0));
    // Don't hang forever if a connection refuses to close.
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
