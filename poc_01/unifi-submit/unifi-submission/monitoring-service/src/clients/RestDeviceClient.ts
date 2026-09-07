import type { HealthCheckResult } from "../domain/types";
import type { Capabilities, DeviceClient } from "./DeviceClient";

/**
 * Per-request timeout. Must stay comfortably below the poll interval: a
 * request that hangs longer than one cycle would let checks pile up on
 * top of each other, which is how a monitoring service ends up taking
 * down the thing it monitors.
 */
const REQUEST_TIMEOUT_MS = 2_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface DiagnosticsResponse {
  hwVersion: string;
  swVersion: string;
  fwVersion: string;
  status?: string;
}

export class RestDeviceClient implements DeviceClient {
  async discoverCapabilities(address: string): Promise<Capabilities> {
    const res = await fetchWithTimeout(`http://${address}/health`);
    if (!res.ok) {
      throw new Error(`Capability discovery failed: HTTP ${res.status}`);
    }
    return (await res.json()) as Capabilities;
  }

  async checkHealth(address: string): Promise<HealthCheckResult> {
    try {
      const healthRes = await fetchWithTimeout(`http://${address}/health`);
      if (!healthRes.ok) return { ok: false };

      const diagRes = await fetchWithTimeout(`http://${address}/diagnostics`);
      if (!diagRes.ok) return { ok: false };

      const diag = (await diagRes.json()) as DiagnosticsResponse;
      return {
        ok: true,
        diagnostics: {
          hwVersion: diag.hwVersion,
          swVersion: diag.swVersion,
          fwVersion: diag.fwVersion,
          // A device that reports no status yields null rather than this
          // service inventing one on its behalf.
          deviceReportedStatus: diag.status ?? null,
        },
      };
    } catch {
      // Timeout, DNS failure, connection refused, malformed JSON — all
      // are simply "the check did not succeed". The poller owns the
      // decision about what that means.
      return { ok: false };
    }
  }
}
