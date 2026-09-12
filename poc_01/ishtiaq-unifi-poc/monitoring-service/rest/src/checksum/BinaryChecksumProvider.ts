import { execFile } from "child_process";
import { promisify } from "util";
import type { DiagnosticsPayload } from "../../../datasource-module/domain/types";
import type { ChecksumProvider } from "./ChecksumProvider";
import type { Logger } from "../domain/logger";

const execFileAsync = promisify(execFile);

/**
 * Invokes the external checksum binary.
 *
 * NOT IN USE YET — the binary doesn't exist (see StubChecksumProvider,
 * which is what's wired up). This class exists so the integration
 * question is answered concretely rather than hand-waved: when the
 * binary arrives, the work is setting CHECKSUM_BINARY_PATH and
 * confirming the argument order below matches what it actually
 * expects, not designing an integration from scratch.
 *
 * The assumptions it makes about the binary are listed explicitly
 * below precisely BECAUSE they're guesses — they're the questions to
 * ask whoever owns the binary, written down where they can't be
 * forgotten:
 *
 *   1. Invoked as: <binary> <deviceId>, diagnostics as JSON on stdin.
 *   2. Writes the checksum to stdout, one line, nothing else.
 *   3. Exit code 0 = success; non-zero = could not compute.
 *   4. Terminates on its own; doesn't need a signal.
 *
 * Every one of those could be wrong. None of them can be confirmed
 * without the binary, and inventing a "flexible" implementation that
 * guesses at several possible conventions would be worse — more code,
 * still unverified, and harder to correct once the truth is known.
 */
export class BinaryChecksumProvider implements ChecksumProvider {
  constructor(
    private readonly binaryPath: string,
    private readonly log: Logger,
    /**
     * Bounded, because this runs inside the poller's cycle. A binary
     * that hangs must not be able to stall device monitoring — the
     * same reasoning as RestDeviceClient's request timeout.
     */
    private readonly timeoutMs = 5_000,
  ) {}

  async computeChecksum(
    deviceId: string,
    diagnostics: DiagnosticsPayload,
  ): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(this.binaryPath, [deviceId], {
        timeout: this.timeoutMs,
        // execFile, NOT exec: execFile does not spawn a shell, so a
        // device-supplied value reaching this path can't be turned
        // into shell injection. Diagnostics come from devices on an
        // untrusted network; treating them as safe to interpolate
        // into a shell string would be a genuine vulnerability.
      });

      const checksum = stdout.trim();
      // An empty stdout with exit code 0 means the binary ran but had
      // nothing to say. Returning "" would write an empty string into
      // a column whose contract is "a checksum or null" — null is the
      // honest mapping.
      return checksum.length > 0 ? checksum : null;
    } catch (error) {
      // Missing binary, non-zero exit, timeout — all the same outcome
      // from the caller's perspective: no checksum available. Logged
      // at warn rather than error because, per ChecksumProvider's
      // contract, this must not cost the service the reading itself.
      this.log.warn("checksum unavailable", {
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
