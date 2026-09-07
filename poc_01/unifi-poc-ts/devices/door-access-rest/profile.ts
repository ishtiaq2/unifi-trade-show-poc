// Healthy for a while, then genuinely dead. This is the device that
// proves real down-detection actually fires — the counterpart to
// camera-rest, which proves false alarms don't.
//
// healthyRequests counts REQUESTS, not poll cycles: one monitoring cycle
// issues two (/health + /diagnostics), so 8 here is about 4 cycles.
import type { DeviceProfile } from "../_shared/types";

const profile: DeviceProfile = {
  name: "door-access-rest-1",
  hwVersion: "DA-HW-2.0",
  swVersion: "1.0.4",
  fwVersion: "FW-2.2.0",
  failureMode: "goes-down",
  healthyRequests: 8,
  port: 4004,
};
export default profile;
