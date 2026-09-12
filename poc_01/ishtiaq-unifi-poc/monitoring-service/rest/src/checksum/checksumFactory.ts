import type { ChecksumProvider } from "./ChecksumProvider";
import { StubChecksumProvider } from "./StubChecksumProvider";
import { BinaryChecksumProvider } from "./BinaryChecksumProvider";
import type { Logger } from "../domain/logger";

/**
 * Chooses an implementation based on whether a binary path is
 * configured.
 *
 * Defaults to the stub — deliberately. The service must start and run
 * correctly with no checksum binary present, because that's the
 * current reality and will stay the reality until someone provides
 * one. Requiring CHECKSUM_BINARY_PATH to be set would mean the
 * service couldn't start at all today.
 *
 * When the binary does arrive: set CHECKSUM_BINARY_PATH and restart.
 * No code change, no redeploy of anything else, and the switch is
 * logged below so it's visible in the logs which implementation is
 * actually live — a silent switch between "real checksums" and "no
 * checksums" is exactly the kind of thing that should never be
 * ambiguous when reading a production log.
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
