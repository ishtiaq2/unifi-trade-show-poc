import type { HealthCheckResult } from "../domain/types.js";
import type { Capabilities, DeviceClient } from "./DeviceClient.js";

const REQUEST_TIMEOUT_MS = 2000; // shorter than the poll interval, so a
// hung request can't cause checks to pile up (per specification.md).

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class RestDeviceClient implements DeviceClient {
  async discoverCapabilities(address: string): Promise<Capabilities> {
    const res = await fetchWithTimeout(`http://${address}/health`);
    if (!res.ok) throw new Error(`Capability discovery failed: HTTP ${res.status}`);
    const body = (await res.json()) as Capabilities;
    return body;
  }

  async checkHealth(address: string): Promise<HealthCheckResult> {
    try {
      const healthRes = await fetchWithTimeout(`http://${address}/health`);
      if (!healthRes.ok) return { ok: false };

      const diagRes = await fetchWithTimeout(`http://${address}/diagnostics`);
      if (!diagRes.ok) return { ok: false };
      const diag = (await diagRes.json()) as {
        hwVersion: string;
        swVersion: string;
        fwVersion: string;
        status?: string;
      };
      return {
        ok: true,
        diagnostics: {
          hwVersion: diag.hwVersion,
          swVersion: diag.swVersion,
          fwVersion: diag.fwVersion,
          // The device's own claim about itself. Optional on the wire:
          // a device that doesn't report one yields null rather than
          // this service inventing a value for it.
          deviceReportedStatus: diag.status ?? null,
        },
      };
    } catch {
      // Network error, timeout, or abort — all treated as a failed check,
      // never an unhandled exception. The poller decides what a failure
      // means (suspect vs. down); the client only reports "did it work."
      return { ok: false };
    }
  }
}
