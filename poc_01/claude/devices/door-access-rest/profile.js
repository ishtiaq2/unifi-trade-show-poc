// Healthy for a while, then genuinely dead - demonstrates real
// down-detection actually firing, not just false-alarm avoidance.
module.exports = {
  name: "door-access-rest-1",
  hwVersion: "DA-HW-2.0",
  swVersion: "1.0.4",
  fwVersion: "FW-2.2.0",
  failureMode: "goes-down",
  healthyRequests: 8,
  port: 4004,
};
