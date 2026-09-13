// Baseline healthy device. Always reachable, always reports "ok" —
// the control case against which the failure devices are contrasted.
import type { DeviceProfile } from "../../shared/types";

const unifi_router: DeviceProfile = {
  name: "router-rest",
  hwVersion: "UNIFI-RTR-HW-1",
  swVersion: "1.0.0",
  fwVersion: "FW-1.0.0",
  failureMode: "none",
  port: 4001,
};
export default unifi_router;
