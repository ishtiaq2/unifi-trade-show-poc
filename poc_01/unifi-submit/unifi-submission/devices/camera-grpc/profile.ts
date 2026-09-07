// One of the "new devices" that speak gRPC rather than REST.
import type { DeviceProfile } from "../_shared/types";

const profile: DeviceProfile = {
  name: "camera-grpc-1",
  hwVersion: "CAM-HW-2.0",
  swVersion: "4.0.0",
  fwVersion: "FW-5.0.1",
  failureMode: "none",
  port: 4005,
};
export default profile;
