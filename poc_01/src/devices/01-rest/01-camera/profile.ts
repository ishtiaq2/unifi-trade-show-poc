// Intermittent, not broken: simulates a camera behind an unstable
// network link. Demonstrates reachable -> suspect -> reachable, and must
// NOT falsely settle on "down" (dev-and-troubleshoot/assumptions.md #4).
//
// failureRate is 0.15, not the more intuitive 0.35, because the rate
// compounds: the monitoring service calls /health AND /diagnostics per
// check, each rolling independently, so the effective check-failure
// probability is 1 - (1 - rate)^2. Simulation at 0.35 produced ~5 false
// "down" transitions over a two-hour demo; at 0.15 false alarms are
// effectively impossible while "suspect" blips stay visible.
import type { DeviceProfile } from "../../shared/types";

const camera: DeviceProfile = {
  name: "unifi-camera-rest",
  hwVersion: "UNIFI-CAM-HW-1",
  swVersion: "1.0.0",
  fwVersion: "FW-1.0.0",
  failureMode: "flaky",
  failureRate: 0.15,
  port: 4003,
};
export default camera;
