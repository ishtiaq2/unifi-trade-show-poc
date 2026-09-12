import { execFile } from "child_process";
import { promisify } from "util";
import type { DiagnosticsPayload } from "../../../datasource-module/domain/types";
import type { Logger } from "../domain/logger";

const execFileAsync = promisify(execFile);

/**
 * The seam for the external checksum binary, which doesn't exist yet.
 *
 * Implementations must return null rather than throwing when they
 * can't produce a checksum: the poller calls this while recording
 * diagnostics, and a throw would discard a good health check over a
 * missing nice-to-have.
 */
export interface ChecksumProvider {
  computeChecksum(
    deviceId: string,
    diagnostics: DiagnosticsPayload,
  ): Promise<string | null>;
}

/**
 * In use until the real binary exists. Returns null — deliberately,
 * not lazily.
 *
 * The tempting alternative is hashing the diagnostics payload so the
 * column has real-looking data. That would be worse than nothing: a
 * hash computed here from what the device just reported verifies
 * nothing about actual firmware, while looking exactly like a working
 * integrity check. This database gets inspected offline, so an
 * obviously-absent value beats a plausible lie.
 */
export class StubChecksumProvider implements ChecksumProvider {
  // Arguments ignored but kept: the signature is the real contract, so
  // swapping in the binary implementation touches nothing else.
  async computeChecksum(
    _deviceId: string,
    _diagnostics: DiagnosticsPayload,
  ): Promise<string | null> {
    return null;
  }
}

/**
 * Invokes the external binary. Not in use yet — these assumptions are
 * unverified guesses, and the questions to ask whoever owns it:
 *   1. Invoked as `<binary> <deviceId>`?
 *   2. Checksum on stdout, one line?
 *   3. Exit 0 = success, non-zero = couldn't compute?
 */
export class BinaryChecksumProvider implements ChecksumProvider {
  constructor(
    private readonly binaryPath: string,
    private readonly log: Logger,
    // Bounded: this runs inside the poll cycle, so a hung binary must
    // not be able to stall device monitoring.
    private readonly timeoutMs = 5_000,
  ) {}

  async computeChecksum(
    deviceId: string,
    _diagnostics: DiagnosticsPayload,
  ): Promise<string | null> {
    try {
      // execFile, not exec — no shell, so device-supplied values can't
      // be turned into shell injection.
      const { stdout } = await execFileAsync(this.binaryPath, [deviceId], {
        timeout: this.timeoutMs,
      });
      const checksum = stdout.trim();
      return checksum.length > 0 ? checksum : null;
    } catch (error) {
      this.log.warn("checksum unavailable", {
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

/**
 * Defaults to the stub, because the service has to run correctly with
 * no binary present — that's the current reality. Logs which one is
 * live so it's never ambiguous in a production log.
 */
export function createChecksumProvider(
  binaryPath: string | null,
  log: Logger,
): ChecksumProvider {
  if (binaryPath) {
    log.info("checksum provider: binary", { binaryPath });
    return new BinaryChecksumProvider(binaryPath, log);
  }
  log.info("checksum provider: stub (no CHECKSUM_BINARY_PATH set — checksums will be null)");
  return new StubChecksumProvider();
}
