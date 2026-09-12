import type { DiagnosticsPayload } from "../../../datasource-module/domain/types";
import type { ChecksumProvider } from "./ChecksumProvider";

/**
 * The implementation in use until the real checksum binary exists.
 *
 * Returns null. Always. That is the whole implementation, and it is
 * deliberate rather than lazy.
 *
 * WHY NOT FABRICATE SOMETHING: the obvious shortcut is to hash the
 * diagnostics payload here — sha256 of the version strings, say — so
 * the column has "real-looking" data in it for the demo. That would be
 * actively harmful, for a specific reason: a checksum's entire purpose
 * is to verify that firmware on a device matches what it should be. A
 * hash computed by THIS SERVICE from data the device just reported
 * verifies nothing at all — it's a hash of the device's own claims,
 * not of the firmware. It would look exactly like a working integrity
 * check while providing zero integrity guarantee.
 *
 * This database gets inspected offline (per the brief), so a
 * realistic-looking hash that verifies nothing is strictly worse than
 * an obviously absent one: the null is self-documenting, the fake
 * hash silently lies. Someone reading the table later can tell at a
 * glance that checksums aren't available yet; they could not tell that
 * a sha256 was meaningless without reading this file.
 *
 * WHY IT TAKES ARGUMENTS IT IGNORES: the signature is the real
 * contract, not this implementation. Keeping the full signature means
 * the day the binary arrives, only this class is replaced — every
 * call site already passes what a real implementation needs.
 */
export class StubChecksumProvider implements ChecksumProvider {
  async computeChecksum(
    _deviceId: string,
    _diagnostics: DiagnosticsPayload,
  ): Promise<string | null> {
    return null;
  }
}
