import type { Pool } from "pg";
import type { Device, Diagnostics, DeviceStatus, Protocol } from "../domain/types.js";

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
 * Thin wrapper over `pg`, not an ORM — this PoC's data access is simple
 * enough (a handful of queries against two tables) that an ORM would add
 * a dependency and a learning curve without solving a problem this
 * project actually has.
 */
export class DeviceRepository {
  constructor(private pool: Pool) {}

  async listDevices(): Promise<Device[]> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT * FROM devices ORDER BY created_at ASC`,
    );
    return rows.map(toDevice);
  }

  async getDevice(id: string): Promise<Device | null> {
    const { rows } = await this.pool.query<DeviceRow>(`SELECT * FROM devices WHERE id = $1`, [
      id,
    ]);
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

  async setCapabilities(id: string, protocol: Protocol, capabilities: unknown): Promise<void> {
    await this.pool.query(
      `UPDATE devices SET protocol = $2, capabilities = $3, updated_at = now() WHERE id = $1`,
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
    diagnostics: { hwVersion: string; swVersion: string; fwVersion: string; checksum: string | null },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO diagnostics (device_id, hw_version, sw_version, fw_version, checksum)
       VALUES ($1, $2, $3, $4, $5)`,
      [deviceId, diagnostics.hwVersion, diagnostics.swVersion, diagnostics.fwVersion, diagnostics.checksum],
    );
  }

  /** Latest diagnostics snapshot for a device, or null if none recorded yet. */
  async latestDiagnostics(deviceId: string): Promise<Diagnostics | null> {
    const { rows } = await this.pool.query(
      `SELECT hw_version, sw_version, fw_version, checksum, recorded_at
       FROM diagnostics WHERE device_id = $1
       ORDER BY recorded_at DESC LIMIT 1`,
      [deviceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      hwVersion: r.hw_version,
      swVersion: r.sw_version,
      fwVersion: r.fw_version,
      checksum: r.checksum,
      recordedAt: r.recorded_at,
    };
  }
}
