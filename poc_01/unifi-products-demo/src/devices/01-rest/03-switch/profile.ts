// Perfectly reachable, but reports a fault about ITSELF. This device
// exists to prove that device-reported status and derived reachability
// are two different facts: the monitoring API shows this as
// status=reachable with diagnostics.deviceReportedStatus="degraded".
// See dev-and-troubleshoot/assumptions.md #8.
import type { DeviceProfile } from "../_shared/types";

const unifi_switch: DeviceProfile = {
  name: "switch-1",
  hwVersion: "SW-HW-3.0",
  swVersion: "2.1.1",
  fwVersion: "FW-7.0.0",
  failureMode: "none",
  reportedStatus: "degraded",
  port: 4002,
};
export default unifi_switch;
