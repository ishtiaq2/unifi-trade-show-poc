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
    payload: DiagnosticsPayload & { checksum: string | null },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO diagnostics
         (device_id, hw_version, sw_version, fw_version, device_reported_status, checksum)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        deviceId,
        payload.hwVersion,
        payload.swVersion,
        payload.fwVersion,
        payload.deviceReportedStatus,
        payload.checksum,
      ],
    );
  }

  async latestDiagnostics(deviceId: string): Promise<Diagnostics | null> {
    const { rows } = await this.pool.query(
      `SELECT hw_version, sw_version, fw_version, device_reported_status, checksum, recorded_at
       FROM diagnostics
       WHERE device_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [deviceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      hwVersion: r.hw_version,
      swVersion: r.sw_version,
      fwVersion: r.fw_version,
      deviceReportedStatus: r.device_reported_status,
      checksum: r.checksum,
      recordedAt: r.recorded_at,
    };
  }
}
