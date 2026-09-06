// Intermittent, not broken: simulates a camera behind an unstable network
// link. This is the device that should demonstrate reachable -> suspect
// -> reachable, and never falsely settle on "down" (docs/assumptions.md #4).
module.exports = {
  name: "camera-rest-1",
  hwVersion: "CAM-HW-1.5",
  swVersion: "3.2.0",
  fwVersion: "FW-4.1.0",
  failureMode: "flaky",
  failureRate: 0.35,
  port: 4003,
};
