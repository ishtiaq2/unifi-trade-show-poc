// A camera behind an unstable network link: intermittently unreachable,
// but never actually broken. Demonstrates that a failed RPC is not the
// same thing as a failed device — a client should retry before drawing
// any conclusion.
//
// failureRate is PER RPC. A client calling GetHealth then
// GetDiagnostics makes two, so the chance of at least one failing is
// 1 - (1 - 0.3)^2 = 51%, not 30%. Set high deliberately here so the
// demo reliably shows failures within a handful of calls.
import type { DeviceProfile } from "../_shared/types";

const profile: DeviceProfile = {
  name: "camera-grpc-flaky-1",
  hwVersion: "CAM-HW-2.1",
  swVersion: "4.0.1",
  fwVersion: "FW-5.0.2",
  failureMode: "flaky",
  failureRate: 0.3,
  port: 4007,
};
export default profile;
