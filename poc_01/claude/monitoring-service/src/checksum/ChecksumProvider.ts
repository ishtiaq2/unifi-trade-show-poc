export interface DiagnosticsInput {
  hwVersion: string;
  swVersion: string;
  fwVersion: string;
  /** Included because the brief specifies the checksum covers "the
   *  diagnostics data", and status is one of the five listed diagnostics
   *  fields — a checksum that silently omitted it would not actually
   *  verify the payload it claims to. */
  deviceReportedStatus: string | null;
}

export interface ChecksumProvider {
  computeChecksum(input: DiagnosticsInput): Promise<string | null>;
}

/**
 * Per docs/assumptions.md #3: the real checksum-generator binary doesn't
 * exist yet ("I don't have it, will plug that in later"). This stub is
 * the entire point of defining ChecksumProvider as an interface — the
 * real implementation (presumably shelling out to the binary, or calling
 * it via some IPC mechanism not yet specified) is a drop-in replacement
 * for this file alone. Nothing else in the service changes.
 *
 * Deliberately returns null rather than a fake-but-plausible checksum
 * value — a fabricated checksum that happens to look right is worse than
 * an honest "not available yet," since it could be mistaken for real
 * verification data by whoever inspects the Postgres table offline.
 */
export class StubChecksumProvider implements ChecksumProvider {
  async computeChecksum(_input: DiagnosticsInput): Promise<string | null> {
    return null;
  }
}
