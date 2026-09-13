import { describe, expect, it } from "vitest";
import { writeFileSync, chmodSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  StubChecksumProvider,
  BinaryChecksumProvider,
  createChecksumProvider,
} from "../src/checksum/checksum";
import { silentLogger } from "../src/domain/logger";
import { loadConfig } from "../src/config/config";
import type { DiagnosticsPayload } from "../../datasource-module/domain/types";

const SAMPLE: DiagnosticsPayload = {
  hwVersion: "HW-1",
  swVersion: "SW-1",
  fwVersion: "FW-1",
  deviceReportedStatus: "ok",
};

/**
 * BinaryChecksumProvider is tested against REAL executable scripts
 * written to a temp directory, not a mocked child_process. The whole
 * risk in that class is how it handles a real external process —
 * exit codes, stdout parsing, timeouts, a missing file. Mocking
 * child_process would only confirm the code calls execFile, which is
 * the one part that can't really be wrong.
 */
function makeScript(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "checksum-test-"));
  const file = path.join(dir, "checksum.sh");
  writeFileSync(file, contents);
  chmodSync(file, 0o755);
  return file;
}

describe("StubChecksumProvider", () => {
  it("returns null — the honest answer until the binary exists", async () => {
    const provider = new StubChecksumProvider();
    expect(await provider.computeChecksum("device-1", SAMPLE)).toBeNull();
  });

  it("returns null regardless of input — never fabricates a plausible-looking hash", async () => {
    const provider = new StubChecksumProvider();
    // A hash of device-reported data would verify nothing about actual
    // firmware, while looking exactly like a working integrity check.
    // This test exists to make that a deliberate, locked-in decision
    // rather than something a future "helpful" edit quietly reverses.
    expect(await provider.computeChecksum("a", SAMPLE)).toBeNull();
    expect(
      await provider.computeChecksum("b", { ...SAMPLE, fwVersion: "FW-999" }),
    ).toBeNull();
  });

  it("does not throw — a checksum failure must never cost the reading", async () => {
    const provider = new StubChecksumProvider();
    await expect(
      provider.computeChecksum("device-1", {
        hwVersion: null,
        swVersion: null,
        fwVersion: null,
        deviceReportedStatus: null,
      }),
    ).resolves.toBeNull();
  });
});

describe("BinaryChecksumProvider (real child processes)", () => {
  it("returns the binary's stdout, trimmed", async () => {
    const script = makeScript("#!/bin/sh\necho 'abc123checksum'\n");
    const provider = new BinaryChecksumProvider(script, silentLogger);
    expect(await provider.computeChecksum("device-1", SAMPLE)).toBe("abc123checksum");
  }, 15_000);

  it("passes the deviceId as the first argument", async () => {
    // Echoes its own first arg back, so the returned value proves what
    // the binary actually received.
    const script = makeScript('#!/bin/sh\necho "got:$1"\n');
    const provider = new BinaryChecksumProvider(script, silentLogger);
    expect(await provider.computeChecksum("device-xyz", SAMPLE)).toBe("got:device-xyz");
  }, 15_000);

  it("returns null on a non-zero exit rather than throwing", async () => {
    const script = makeScript("#!/bin/sh\nexit 3\n");
    const provider = new BinaryChecksumProvider(script, silentLogger);
    expect(await provider.computeChecksum("device-1", SAMPLE)).toBeNull();
  }, 15_000);

  it("returns null when the binary does not exist", async () => {
    const provider = new BinaryChecksumProvider("/nonexistent/checksum-binary", silentLogger);
    expect(await provider.computeChecksum("device-1", SAMPLE)).toBeNull();
  }, 15_000);

  it("returns null (not empty string) when the binary succeeds but prints nothing", async () => {
    // "" in a column whose contract is "a checksum or null" would be a
    // third state nothing else in the system knows how to interpret.
    const script = makeScript("#!/bin/sh\nexit 0\n");
    const provider = new BinaryChecksumProvider(script, silentLogger);
    expect(await provider.computeChecksum("device-1", SAMPLE)).toBeNull();
  }, 15_000);

  it("returns null when the binary hangs past the timeout, instead of stalling the poller", async () => {
    const script = makeScript("#!/bin/sh\nsleep 30\n");
    // 500ms timeout — a hung binary must not be able to stall device
    // monitoring, which is why the timeout is bounded at all.
    const provider = new BinaryChecksumProvider(script, silentLogger, 500);

    const started = Date.now();
    const result = await provider.computeChecksum("device-1", SAMPLE);
    const elapsed = Date.now() - started;

    expect(result).toBeNull();
    // Proves it actually gave up early rather than waiting out the
    // full 30s sleep.
    expect(elapsed).toBeLessThan(5_000);
  }, 20_000);

  it("does not invoke a shell — a device-supplied value cannot inject", async () => {
    // execFile, not exec. If a shell were involved, the `;` and
    // backticks below would be interpreted. Instead they arrive as a
    // literal argument string, which is what this asserts.
    const script = makeScript('#!/bin/sh\necho "arg:$1"\n');
    const provider = new BinaryChecksumProvider(script, silentLogger);
    const nasty = "id; echo pwned `whoami`";
    expect(await provider.computeChecksum(nasty, SAMPLE)).toBe(`arg:${nasty}`);
  }, 15_000);
});

describe("createChecksumProvider", () => {
  it("returns the stub when no binary path is configured", async () => {
    const provider = createChecksumProvider(null, silentLogger);
    expect(provider).toBeInstanceOf(StubChecksumProvider);
  });

  it("returns the binary provider when a path IS configured", () => {
    const provider = createChecksumProvider("/some/path", silentLogger);
    expect(provider).toBeInstanceOf(BinaryChecksumProvider);
  });

  it("treats an empty-string path as 'not configured', not as a path", () => {
    // Asserts the real mapping in loadConfig, which uses `||` (not
    // `??`) precisely so CHECKSUM_BINARY_PATH= yields null rather than
    // a path of "". Exercised through loadConfig itself rather than
    // hand-writing `"" || null`, which TypeScript correctly flags as
    // an always-falsy expression — and which wouldn't be testing the
    // real code path anyway.
    const config = loadConfig({ CHECKSUM_BINARY_PATH: "" } as NodeJS.ProcessEnv);
    expect(config.checksumBinaryPath).toBeNull();
    expect(createChecksumProvider(config.checksumBinaryPath, silentLogger))
      .toBeInstanceOf(StubChecksumProvider);
  });

  it("an unset CHECKSUM_BINARY_PATH also yields the stub", () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.checksumBinaryPath).toBeNull();
  });
});
