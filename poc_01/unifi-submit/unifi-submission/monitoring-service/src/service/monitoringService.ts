import type { DeviceRepository } from "../repo/deviceRepository";
import { discoverProtocol } from "../clients/clientFactory";
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
    private repo: DeviceRepository,
    private log: Logger,
  ) {}

  listDevices(): Promise<Device[]> {
    return this.repo.listDevices();
  }

  async getDeviceWithDiagnostics(
    id: string,
  ): Promise<{ device: Device; diagnostics: Diagnostics | null }> {
    const device = await this.repo.getDevice(id);
    if (!device) throw new DeviceNotFoundError(id);
    const diagnostics = await this.repo.latestDiagnostics(id);
    return { device, diagnostics };
  }

  /**
   * Registers a device and immediately attempts capability discovery, per
   * the brief's "use its health endpoint to get the capabilities".
   *
   * If discovery fails the device is still created, with protocol left
   * null for the poller to resolve on a later cycle. This is deliberate:
   * at a trade show, gear gets added to the list while it is still
   * booting or still being cabled. Rejecting registration because a
   * device is not answering *yet* would make the system frustrating
   * exactly when it is being set up, which is when it is most used.
   *
   * Rejects a duplicate address rather than silently monitoring the same
   * device twice — that would double its poll traffic and show it twice
   * on the demo screen.
   */
  async registerDevice(input: { name: string; address: string }): Promise<Device> {
    const existing = await this.repo.findByAddress(input.address);
    if (existing) throw new DuplicateDeviceError(input.address);

    const device = await this.repo.createDevice(input);

    try {
      const { protocol, capabilities } = await discoverProtocol(device.address);
      await this.repo.setCapabilities(device.id, protocol, capabilities);
      this.log.info("device registered", {
        deviceId: device.id,
        deviceName: device.name,
        protocol,
      });
      return (await this.repo.getDevice(device.id)) ?? device;
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
    const deleted = await this.repo.deleteDevice(id);
    if (!deleted) throw new DeviceNotFoundError(id);
    this.log.info("device removed", { deviceId: id });
  }
}
