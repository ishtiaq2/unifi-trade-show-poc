// Baseline healthy device. Always reachable, always reports "ok" —
// the control case against which the failure devices are contrasted.
import type { DeviceProfile } from "../_shared/types";

const unifi_router: DeviceProfile = {
  name: "router-1",
  hwVersion: "RTR-HW-2.1",
  swVersion: "1.4.0",
  fwVersion: "FW-9.2.3",
  failureMode: "none",
  port: 4001,
};
export default unifi_router;
