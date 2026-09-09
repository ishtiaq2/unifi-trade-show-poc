import type { SQLService } from "../../../datasource-module/datasource/sql-service";
import type { Device, Diagnostics } from "../../../datasource-module/domain/types";
import type { Logger } from "../domain/logger";
import { discoverProtocol } from "../clients/clientFactory";

export class DeviceNotFoundError extends Error {
  constructor(id: string) {
    super(`Device ${id} not found`);
    this.name = "DeviceNotFoundError";
  }
}

export class DuplicateDeviceError extends Error {
  constructor(address: string) {
    super(`A device is already registered at ${address}`);
    this.name = "DuplicateDeviceError";
  }
}

/**
 * Registration, queries, removal, and (as of step 5) real capability
 * discovery against real REST devices.
 */
export class MonitoringService {
  constructor(
    private sql: SQLService,
    private log: Logger,
  ) {}

  listDevices(): Promise<Device[]> {
    return this.sql.listDevices();
  }

  async getDeviceWithDiagnostics(
    id: string,
  ): Promise<{ device: Device; diagnostics: Diagnostics | null }> {
    const device = await this.sql.getDevice(id);
    if (!device) throw new DeviceNotFoundError(id);
    const diagnostics = await this.sql.latestDiagnostics(id);
    return { device, diagnostics };
  }

  /**
   * Registers a device, then attempts capability discovery immediately,
   * per the brief's "use its health endpoint to get the capabilities".
   *
   * If discovery fails, the device is still created — protocol stays
   * null, exactly as it did before step 5 existed. This is deliberate,
   * not a gap: at a trade show, gear gets added to the list while it's
   * still booting or being cabled. Rejecting registration because a
   * device isn't answering *yet* would make the system most frustrating
   * exactly when it's being set up. From step 7 on, the poller retries
   * discovery on a later cycle for any device stuck at protocol: null —
   * for now, without a poller yet, it stays null until someone re-runs
   * discovery some other way. That gap is real and will close in step 7,
   * not before.
   *
   * Rejects a duplicate address rather than silently monitoring the
   * same device twice, which would double its poll traffic later and
   * show it twice on the demo screen. Enforced here AND by the
   * database's UNIQUE constraint; this check exists to return a clean
   * 409 with a clear message instead of a raw constraint-violation
   * error reaching the HTTP layer.
   */
  async registerDevice(input: { name: string; address: string }): Promise<Device> {
    const existing = await this.sql.findByAddress(input.address);
    if (existing) throw new DuplicateDeviceError(input.address);

    const device = await this.sql.createDevice(input);

    try {
      const { protocol, capabilities } = await discoverProtocol(device.address);
      await this.sql.setCapabilities(device.id, protocol, capabilities);
      this.log.info("device registered", {
        deviceId: device.id,
        deviceName: device.name,
        protocol,
      });
      return (await this.sql.getDevice(device.id)) ?? device;
    } catch (err) {
      this.log.warn("device registered, capability discovery failed", {
        deviceId: device.id,
        deviceName: device.name,
        address: device.address,
        error: err instanceof Error ? err.message : String(err),
      });
      return device;
    }
  }

  async removeDevice(id: string): Promise<void> {
    const deleted = await this.sql.deleteDevice(id);
    if (!deleted) throw new DeviceNotFoundError(id);
    this.log.info("device removed", { deviceId: id });
  }
}
