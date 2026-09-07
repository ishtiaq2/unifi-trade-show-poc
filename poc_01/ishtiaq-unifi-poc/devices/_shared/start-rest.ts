import { createRestDevice } from "./rest-simulator";
import { resolvePort, type DeviceProfile } from "./types";

/**
 * Starts a REST device simulator. Every REST device folder's index.ts is
 * a two-line call to this, so the listen/log/port-resolution behavior is
 * defined once instead of copy-pasted four times.
 */
export function startRestDevice(profile: DeviceProfile): void {
  const app = createRestDevice(profile);
  const port = resolvePort(profile);
  const server = app.listen(port, () => {
    console.log(`[${profile.name}] REST device simulator listening on :${port}`);
  });

  // Node already exits on SIGTERM by default, so this is not what makes
  // `podman stop` work. It exists to drain in-flight requests instead of
  // cutting them off mid-response, and to log the stop so a container
  // that vanished during a demo can be told apart from one that crashed.
  const shutdown = (signal: string) => {
    console.log(`[${profile.name}] ${signal} received, closing`);
    server.close(() => process.exit(0));
    // Don't hang forever if a connection refuses to close.
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
