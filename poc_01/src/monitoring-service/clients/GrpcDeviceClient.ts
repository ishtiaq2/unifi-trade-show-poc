import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { HealthCheckResult } from "../datasource-module/models/types";
import type { Capabilities, DeviceClient } from "./clientFactory";

/**
 * Per-request deadline, matching RestDeviceClient's timeout. gRPC
 * deadlines are absolute timestamps, not durations — hence
 * `Date.now() + REQUEST_TIMEOUT_MS` at each call site rather than
 * passing the constant directly.
 */
const REQUEST_TIMEOUT_MS = 2_000;

/**
 * Channel options passed to every gRPC client.
 *
 * Adding `grpc.connect-timeout_ms: 2000` ensures that when an address is
 * completely unreachable (or DNS fails to resolve during test execution),
 * the connection attempt fails fast in 2 seconds rather than lingering in
 * the gRPC backoff loop for up to 30 seconds.
 */
const CHANNEL_OPTIONS: grpc.ChannelOptions = {
  "grpc.connect-timeout_ms": REQUEST_TIMEOUT_MS,
  "grpc.max_receive_message_length": 1024 * 1024 * 10,
};

const PROTO_PATH = path.join(__dirname, "proto", "device.proto");

const loaderOptions: protoLoader.Options = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

interface HealthResponse {
  protocol: string;
  capabilities: string[];
  deviceName: string;
}

interface DiagnosticsResponse {
  hwVersion: string;
  swVersion: string;
  fwVersion: string;
  status: string;
}

let cachedProto: any = null;

function loadDeviceProto(): any {
  if (!cachedProto) {
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, loaderOptions);
    cachedProto = (grpc.loadPackageDefinition(packageDefinition) as any).device;
  }
  return cachedProto;
}

/** Promise wrapper around a unary call, with an explicit deadline. */
function unaryCall<T>(client: any, method: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    client[method](
      {},
      { deadline: Date.now() + REQUEST_TIMEOUT_MS },
      (err: grpc.ServiceError | null, res: T) => (err ? reject(err) : resolve(res)),
    );
  });
}

export class GrpcDeviceClient implements DeviceClient {
  private channels = new Map<string, any>();

  private clientFor(address: string): any {
    let client = this.channels.get(address);
    if (!client) {
      const proto = loadDeviceProto();
      // Pass CHANNEL_OPTIONS to enforce connection deadlines and channel rules
      client = new proto.DeviceService(
        address,
        grpc.credentials.createInsecure(),
        CHANNEL_OPTIONS,
      );
      this.channels.set(address, client);
    }
    return client;
  }

  async discoverCapabilities(address: string): Promise<Capabilities> {
    const res = await unaryCall<HealthResponse>(this.clientFor(address), "getHealth");
    return {
      protocol: "grpc",
      capabilities: res.capabilities ?? [],
      deviceName: res.deviceName,
    };
  }

  async checkHealth(address: string): Promise<HealthCheckResult> {
    try {
      const client = this.clientFor(address);

      await unaryCall<HealthResponse>(client, "getHealth");
      const diag = await unaryCall<DiagnosticsResponse>(client, "getDiagnostics");

      return {
        ok: true,
        diagnostics: {
          hwVersion: diag.hwVersion ?? null,
          swVersion: diag.swVersion ?? null,
          fwVersion: diag.fwVersion ?? null,
          deviceReportedStatus: diag.status ?? null,
        },
      };
    } catch {
      return { ok: false };
    }
  }

  close(): void {
    for (const client of this.channels.values()) {
      client.close?.();
    }
    this.channels.clear();
  }
}
