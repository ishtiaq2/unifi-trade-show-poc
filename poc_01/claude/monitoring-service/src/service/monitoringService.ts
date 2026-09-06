import type { DeviceRepository } from "../repo/deviceRepository.js";
import { discoverProtocol } from "../clients/clientFactory.js";
import type { Device, Diagnostics } from "../domain/types.js";

export class DeviceNotFoundError extends Error {
  constructor(id: string) {
    super(`Device ${id} not found`);
    this.name = "DeviceNotFoundError";
  }
}

export class MonitoringService {
  constructor(private repo: DeviceRepository) {}

  async listDevices(): Promise<Device[]> {
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
   * Registers a device, then immediately runs capability discovery
   * against its health endpoint per the brief's explicit instruction.
   * If discovery fails at registration time, the device is still
   * created — a device that's briefly unreachable when added (e.g.
   * still booting on the trade-show floor) shouldn't be rejected
   * outright; the poller will pick up its protocol on a later cycle.
   * This mirrors real registration workflows where the device may not
   * be network-ready the instant it's added to the system.
   */
  async registerDevice(input: { name: string; address: string }): Promise<Device> {
    const device = await this.repo.createDevice(input);
    try {
      const { protocol, capabilities } = await discoverProtocol(device.address);
      await this.repo.setCapabilities(device.id, protocol, capabilities);
      const updated = await this.repo.getDevice(device.id);
      return updated!;
    } catch {
      return device; // protocol stays null; poller retries discovery later
    }
  }

  async removeDevice(id: string): Promise<void> {
    const deleted = await this.repo.deleteDevice(id);
    if (!deleted) throw new DeviceNotFoundError(id);
  }
}
