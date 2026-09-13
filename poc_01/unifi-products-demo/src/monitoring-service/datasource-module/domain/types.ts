// unifi-products-demo/src/monitoring-service/datasource-module/domain/types.ts
export type Protocol = 'rest' | 'grpc';
export type DeviceStatus = 'reachable' | 'suspect' | 'down';

export interface Device {
  id: string;
  name: string;
  address: string;
  protocol: Protocol | null;
  capabilities: unknown;
  status: DeviceStatus;
  consecutiveFailures: number;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
}

export interface DiagnosticsPayload {
  hwVersion: string | null;
  swVersion: string | null;
  fwVersion: string | null;
  deviceReportedStatus: string | null;
}

export interface Diagnostics extends DiagnosticsPayload {
  /**
   * Whether THIS reading came from a successful check. False means a
   * failed check that produced no data — the row still exists to mark
   * that the failure happened, deduplicated and preserved the same way
   * successful readings are. See poller.ts for the dedup decision.
   */
  reachable: boolean;
  checksum: string | null;
  recordedAt: Date;
}

export interface HealthCheckResult {
  ok: boolean;
  diagnostics?: DiagnosticsPayload;
}
