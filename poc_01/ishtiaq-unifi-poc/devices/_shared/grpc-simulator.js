/**
 * Generic gRPC device simulator — the gRPC counterpart to
 * rest-simulator.js. Same reasoning: one implementation, shared by every
 * gRPC-backed device folder (camera-grpc, door-access-grpc), driven by a
 * profile object rather than duplicated per folder.
 *
 * This is deliberately the ONLY gRPC server this PoC needs to build —
 * per docs/assumptions.md #2, the monitoring service's own gRPC client is
 * a stub proven against exactly this kind of mock, not against real
 * hardware that doesn't exist yet.
 */
const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const PROTO_PATH = path.join(__dirname, "device.proto");

function loadDeviceProto() {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false, // camelCase field names on the JS side — see note below
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDefinition).device;
}

function createGrpcDevice(profile) {
  const deviceProto = loadDeviceProto();
  const server = new grpc.Server();
  let requestCount = 0;

  function shouldFail() {
    requestCount += 1;
    if (profile.failureMode === "flaky") {
      return Math.random() < (profile.failureRate ?? 0.3);
    }
    if (profile.failureMode === "goes-down") {
      return requestCount > (profile.healthyRequests ?? 5);
    }
    return false;
  }

  server.addService(deviceProto.DeviceService.service, {
    getHealth: (_call, callback) => {
      if (shouldFail()) {
        return callback({ code: grpc.status.UNAVAILABLE, message: "unavailable" });
      }
      callback(null, {
        protocol: "grpc",
        capabilities: ["diagnostics"],
        deviceName: profile.name,
      });
    },
    getDiagnostics: (_call, callback) => {
      if (shouldFail()) {
        return callback({ code: grpc.status.UNAVAILABLE, message: "unavailable" });
      }
      callback(null, {
        hwVersion: profile.hwVersion,
        swVersion: profile.swVersion,
        fwVersion: profile.fwVersion,
        status: profile.reportedStatus ?? "ok",
      });
    },
  });

  return server;
}

module.exports = { createGrpcDevice, loadDeviceProto };
