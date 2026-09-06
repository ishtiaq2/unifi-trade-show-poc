export type Protocol = "rest" | "grpc";
export type DeviceStatus = "reachable" | "suspect" | "down";

export interface Device {
  id: string;
  name: string;
  address: string; // host:port, protocol-agnostic
  protocol: Protocol | null; // null until capability discovery has run
  capabilities: unknown;
  status: DeviceStatus;
  consecutiveFailures: number;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
}

export interface Diagnostics {
  hwVersion: string;
  swVersion: string;
  fwVersion: string;
  /** The device's own self-reported status, distinct from Device.status
   *  (this service's derived reachability state). Nullable: not every
   *  device is guaranteed to report one. */
  deviceReportedStatus: string | null;
  checksum: string | null; // null while ChecksumProvider is stubbed
  recordedAt: Date;
}

export interface HealthCheckResult {
  ok: boolean;
  diagnostics?: {
    hwVersion: string;
    swVersion: string;
    fwVersion: string;
    deviceReportedStatus: string | null;
  };
}
