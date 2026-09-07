export type Protocol = "rest" | "grpc";

/**
 * The monitoring service's own verdict about a device, derived from
 * health checks. Deliberately three states, not two: see
 * docs/assumptions.md #4 — a binary up/down cannot express "failing but
 * not yet trusted to be down", which is exactly what an unstable network
 * link needs in order to avoid false alarms.
 */
export type DeviceStatus = "reachable" | "suspect" | "down";

export interface Device {
  id: string;
  name: string;
  /** host:port — protocol-agnostic, resolved by capability discovery */
  address: string;
  protocol: Protocol | null;
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
  /**
   * What the device says about ITSELF, distinct from Device.status
   * (whether we can reach it). A device can answer every request
   * perfectly while reporting an internal fault — two different facts,
   * so two different fields. See docs/assumptions.md #8.
   */
  deviceReportedStatus: string | null;
  /** Null while the external checksum binary is unavailable. */
  checksum: string | null;
  recordedAt: Date;
}

export interface DiagnosticsPayload {
  hwVersion: string;
  swVersion: string;
  fwVersion: string;
  deviceReportedStatus: string | null;
}

export interface HealthCheckResult {
  ok: boolean;
  diagnostics?: DiagnosticsPayload;
}
