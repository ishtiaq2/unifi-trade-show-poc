// Answers 6 RPCs, then fails permanently. Simulates a device that
// genuinely dies — power loss, crashed firmware — as opposed to
// camera-grpc-flaky, which recovers on its own.
//
// The distinction matters: a client that retries forever will recover
// from the flaky camera but hang on this one. Both need to be handled,
// and they need to be handled differently.
import type { DeviceProfile } from "../_shared/types";

const profile: DeviceProfile = {
  name: "door-access-grpc-dying-1",
  hwVersion: "DA-HW-3.1",
  swVersion: "2.0.1",
  fwVersion: "FW-3.1.1",
  failureMode: "goes-down",
  healthyRequests: 6,
  port: 4008,
};
export default profile;
