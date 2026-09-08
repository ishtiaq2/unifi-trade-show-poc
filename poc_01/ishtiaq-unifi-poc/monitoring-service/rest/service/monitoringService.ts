// monitoring-service/rest/service/monitoringService.ts

import { SQLService } from "../../datasource-module/datasource/sql-service";
import { discoverProtocol } from "../../clients/clientFactory";
import type { Device, Diagnostics } from "../domain/types";
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
    } catch {
      this.log.warn("device registered, capability discovery pending", {
        deviceId: device.id,
        deviceName: device.name,
        address: device.address,
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
