// Answers every RPC perfectly, but reports a fault about ITSELF.
//
// This device exists to demonstrate that "can I reach it" and "is it
// healthy" are two independent questions. A client that treats a
// successful RPC as proof the device is fine will miss this entirely —
// the fault is in the response body, not in the gRPC status code.
import type { DeviceProfile } from "../_shared/types";

const profile: DeviceProfile = {
  name: "door-access-grpc-1",
  hwVersion: "DA-HW-3.0",
  swVersion: "2.0.0",
  fwVersion: "FW-3.1.0",
  failureMode: "none",
  reportedStatus: "degraded",
  port: 4006,
};
export default profile;
