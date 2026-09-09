// monitoring-service/rest/src/service/monitoringService.ts

import type { SQLService } from "../../../datasource-module/datasource/sql-service";
import type { Device, Diagnostics } from "../../../datasource-module/domain/types";
import type { Logger } from "../domain/logger";

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
 * Step 4 only: registration, queries, removal against real Postgres.
 *
 * Deliberately does NOT attempt capability discovery here, even though
 * a fuller version of this service eventually will. Discovery needs a
 * DeviceClient, which is step 5 — pulling it in now would make this
 * step untestable without also having a working DeviceClient, breaking
 * the "each step independently testable" constraint the roadmap is
 * built around. `protocol` stays null on every device created here;
 * step 5 is exactly the change that starts filling it in.
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
   * Registers a device. `protocol` stays null — see class doc comment.
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
    this.log.info("device registered", {
      deviceId: device.id,
      deviceName: device.name,
      address: device.address,
    });
    return device;
  }

  async removeDevice(id: string): Promise<void> {
    const deleted = await this.sql.deleteDevice(id);
    if (!deleted) throw new DeviceNotFoundError(id);
    this.log.info("device removed", { deviceId: id });
  }
}
