// unifi-products-demo/src/monitoring-service/datasource-module/datasource/sql-service.ts

import type { Pool } from "pg";
import type {
  Device,
  DeviceStatus,
  Diagnostics,
  DiagnosticsPayload,
  Protocol,
} from "../domain/types";

interface DeviceRow {
  id: string;
  name: string;
  address: string;
  protocol: Protocol | null;
  capabilities: unknown;
  status: DeviceStatus;
  consecutive_failures: number;
  last_checked_at: Date | null;
  last_success_at: Date | null;
}

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    protocol: row.protocol,
    capabilities: row.capabilities,
    status: row.status,
    consecutiveFailures: row.consecutive_failures,
    lastCheckedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
  };
}

/**
 * Plain `pg` rather than an ORM: this PoC has two tables and a handful
 * of queries. An ORM would add a dependency, a learning curve for
 * whoever picks this up next, and a layer of indirection over SQL that
 * is already simple enough to read directly.
 *
 * snake_case in the database, camelCase in the domain — the mapping is
 * confined to this file so nothing above it deals with column names.
 */
export class SQLService {
  constructor(private pool: Pool) {}

  async listDevices(): Promise<Device[]> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT * FROM devices ORDER BY created_at ASC`,
    );
    return rows.map(toDevice);
  }

  async getDevice(id: string): Promise<Device | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT * FROM devices WHERE id = $1`,
      [id],
    );
    return rows[0] ? toDevice(rows[0]) : null;
  }

  async findByAddress(address: string): Promise<Device | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT * FROM devices WHERE address = $1`,
      [address],
    );
    return rows[0] ? toDevice(rows[0]) : null;
  }

  async createDevice(input: { name: string; address: string }): Promise<Device> {
    const { rows } = await this.pool.query<DeviceRow>(
      `INSERT INTO devices (name, address) VALUES ($1, $2) RETURNING *`,
      [input.name, input.address],
    );
    return toDevice(rows[0]);
  }

  async deleteDevice(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM devices WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }

  async setCapabilities(
    id: string,
    protocol: Protocol,
    capabilities: unknown,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE devices
       SET protocol = $2, capabilities = $3, updated_at = now()
       WHERE id = $1`,
      [id, protocol, JSON.stringify(capabilities)],
    );
  }

  async updateStatus(
    id: string,
    status: DeviceStatus,
    consecutiveFailures: number,
    succeeded: boolean,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE devices
       SET status = $2,
           consecutive_failures = $3,
           last_checked_at = now(),
           last_success_at = CASE WHEN $4 THEN now() ELSE last_success_at END,
           updated_at = now()
       WHERE id = $1`,
      [id, status, consecutiveFailures, succeeded],
    );
  }

  async recordDiagnostics(
    deviceId: string,
    payload: DiagnosticsPayload & { checksum: string | null; reachable: boolean },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO diagnostics
         (device_id, reachable, hw_version, sw_version, fw_version, device_reported_status, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        deviceId,
        payload.reachable,
        payload.hwVersion,
        payload.swVersion,
        payload.fwVersion,
        payload.deviceReportedStatus,
        payload.checksum,
      ],
    );
  }

  /**
   * Bumps `recorded_at` on the most recent diagnostics row for this
   * device, without touching anything else — used when a new reading is
   * the same kind of result as the last one, so routine repeated checks
   * don't create a fresh row every single cycle.
   *
   * Returns false if there's no existing row to touch, so the caller
   * knows to `recordDiagnostics` (insert) instead. The decision of
   * WHICH to call belongs to the poller, not here — this method and
   * `recordDiagnostics` are both simple, single-purpose writes. Keeping
   * the comparison logic out of this file matches the rest of this
   * class: it maps rows to types, it doesn't decide what a reading
   * means.
   */
  async touchLatestDiagnostics(deviceId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE diagnostics SET recorded_at = now()
       WHERE id = (
         SELECT id FROM diagnostics
         WHERE device_id = $1
         ORDER BY recorded_at DESC
         LIMIT 1
       )`,
      [deviceId],
    );
    return (rowCount ?? 0) > 0;
  }

  async latestDiagnostics(deviceId: string): Promise<Diagnostics | null> {
    const { rows } = await this.pool.query(
      `SELECT reachable, hw_version, sw_version, fw_version, device_reported_status, checksum, recorded_at
       FROM diagnostics
       WHERE device_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [deviceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      reachable: r.reachable,
      hwVersion: r.hw_version,
      swVersion: r.sw_version,
      fwVersion: r.fw_version,
      deviceReportedStatus: r.device_reported_status,
      checksum: r.checksum,
      recordedAt: r.recorded_at,
    };
  }
}
