import type { HealthCheckResult } from "../../../datasource-module/domain/types";
import type { Capabilities, DeviceClient } from "./DeviceClient";

/**
 * Per-request timeout. Kept short and explicit rather than relying on
 * fetch's (very long) default — a hung request against one device
 * should not be able to stall whatever's waiting on this call.
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
  hwVersion?: string;
  swVersion?: string;
  fwVersion?: string;
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
          hwVersion: diag.hwVersion ?? null,
          swVersion: diag.swVersion ?? null,
          fwVersion: diag.fwVersion ?? null,
          // The device's own claim about itself, under the key "status"
          // on the wire — renamed here to deviceReportedStatus so it's
          // never confused with this service's derived Device.status.
          // A device that reports none yields null rather than this
          // client inventing a value on its behalf.
          deviceReportedStatus: diag.status ?? null,
        },
      };
    } catch {
      // Timeout, connection refused, DNS failure, malformed JSON — all
      // are simply "the check did not succeed". The caller (the poller,
      // from step 7 on) decides what that means; this client only
      // reports whether it worked.
      return { ok: false };
    }
  }
}
