import type { DiagnosticsPayload } from "../../../datasource-module/domain/types";

/**
 * The seam for the external checksum binary the brief describes as not
 * yet available.
 *
 * This interface exists so the binary can be dropped in later without
 * touching the poller, the repository, or the schema — the same reason
 * DeviceClient exists for protocols. Building the seam now, while the
 * real implementation is still missing, is the entire point of this
 * step: the shape of the integration gets decided while it's cheap to
 * change, rather than being improvised under pressure the day the
 * binary arrives.
 */
export interface ChecksumProvider {
  /**
   * Computes a checksum for a device's diagnostics reading.
   *
   * Returns `null` when no checksum can be produced — which is the
   * normal, expected case until the real binary exists. Null is a
   * first-class result here, not an error condition: see
   * StubChecksumProvider for why that matters.
   *
   * MUST NOT throw for the ordinary "can't compute one" case. A
   * checksum is supplementary information about a reading; failing to
   * get one should never cost the service the reading itself. The
   * poller calls this in the middle of recording diagnostics, and a
   * throw there would discard a perfectly good health check over a
   * missing nice-to-have.
   */
  computeChecksum(
    deviceId: string,
    diagnostics: DiagnosticsPayload,
  ): Promise<string | null>;
}
