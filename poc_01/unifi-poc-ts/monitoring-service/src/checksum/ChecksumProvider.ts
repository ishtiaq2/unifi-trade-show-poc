import type { DiagnosticsPayload } from "../domain/types";

export interface ChecksumProvider {
  /**
   * Returns a checksum over the diagnostics payload, or null when no
   * checksum can be produced.
   */
  computeChecksum(input: DiagnosticsPayload): Promise<string | null>;
}

/**
 * The brief: "You must also integrate this server ... with an external
 * checksum generator binary executable ... I don't have it yet, so just
 * focus on preparing the full PoC, will plug that in later."
 *
 * So the deliverable here is the integration *seam*, not a working
 * integration. This interface is what makes the real binary a drop-in
 * change to exactly one file later — the poller and repository never
 * learn where a checksum comes from.
 *
 * Returns null rather than a plausible-looking fake value. A fabricated
 * checksum is worse than an absent one: the brief says the database will
 * be inspected offline, and a realistic-looking hash that verifies
 * nothing could easily be mistaken for genuine integrity data by
 * whoever inspects it.
 *
 * When the binary arrives, the likely shape is a ProcessChecksumProvider
 * that spawns it with the payload on stdin, enforces a timeout, and
 * falls back to null on non-zero exit — so that a broken checksum tool
 * degrades diagnostics rather than taking monitoring down with it.
 */
export class StubChecksumProvider implements ChecksumProvider {
  async computeChecksum(_input: DiagnosticsPayload): Promise<string | null> {
    return null;
  }
}
