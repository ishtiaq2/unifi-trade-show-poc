// Second gRPC device, so protocol discovery is exercised against more
// than a single sample.
import type { DeviceProfile } from "../_shared/types";

const profile: DeviceProfile = {
  name: "door-access-grpc-1",
  hwVersion: "DA-HW-3.0",
  swVersion: "2.0.0",
  fwVersion: "FW-3.1.0",
  failureMode: "none",
  port: 4006,
};
export default profile;
