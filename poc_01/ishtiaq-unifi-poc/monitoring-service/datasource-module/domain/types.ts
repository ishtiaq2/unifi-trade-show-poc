// monitoring-service/datasource-module/domain/types.ts

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
  checksum: string | null;
  recordedAt: Date;
}

export interface HealthCheckResult {
  ok: boolean;
  diagnostics?: DiagnosticsPayload;
}
