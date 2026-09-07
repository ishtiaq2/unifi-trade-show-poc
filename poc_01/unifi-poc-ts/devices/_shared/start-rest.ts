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
  app.listen(port, () => {
    console.log(`[${profile.name}] REST device simulator listening on :${port}`);
  });
}
