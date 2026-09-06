module.exports = {
  name: "switch-1",
  hwVersion: "SW-HW-3.0",
  swVersion: "2.1.1",
  fwVersion: "FW-7.0.0",
  failureMode: "none",
  // Perfectly reachable, but reports a fault about itself. This is the
  // device that proves device-reported status and derived reachability
  // are genuinely different facts: the API will show this as
  // status=reachable with diagnostics.deviceReportedStatus="degraded".
  reportedStatus: "degraded",
  port: 4002,
};
