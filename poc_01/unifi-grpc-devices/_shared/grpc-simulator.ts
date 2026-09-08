/**
 * Generic gRPC device simulator — one implementation shared by every
 * gRPC device folder, driven entirely by a profile object. Two
 * near-identical servers would be two places to fix the same bug later.
 *
 * These simulators stand in for real networking hardware that speaks
 * gRPC, so a client can be built and demonstrated against something
 * genuinely real — real sockets, real protobuf framing, real gRPC
 * status codes — without physical devices on the bench.
 */
import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { DeviceProfile } from "./types";

const PROTO_PATH = path.join(__dirname, "device.proto");

export function loadDeviceProto(): any {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    // camelCase field names on the JS side. Any client MUST use the
    // same keepCase setting — a mismatch silently yields
    // undefined fields rather than an error.
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return (grpc.loadPackageDefinition(packageDefinition) as any).device;
}

export function createGrpcDevice(profile: DeviceProfile): grpc.Server {
  const deviceProto = loadDeviceProto();
  const server = new grpc.Server();
  let requestCount = 0;

  function shouldFail(): boolean {
    requestCount += 1;
    if (profile.failureMode === "flaky") {
      return Math.random() < (profile.failureRate ?? 0.15);
    }
    if (profile.failureMode === "goes-down") {
      return requestCount > (profile.healthyRequests ?? 5);
    }
    return false;
  }

  server.addService(deviceProto.DeviceService.service, {
    getHealth: (_call: unknown, callback: grpc.sendUnaryData<unknown>) => {
      if (shouldFail()) {
        return callback({ code: grpc.status.UNAVAILABLE, message: "unavailable" });
      }
      callback(null, {
        protocol: "grpc",
        capabilities: ["diagnostics"],
        deviceName: profile.name,
      });
    },
    getDiagnostics: (_call: unknown, callback: grpc.sendUnaryData<unknown>) => {
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
