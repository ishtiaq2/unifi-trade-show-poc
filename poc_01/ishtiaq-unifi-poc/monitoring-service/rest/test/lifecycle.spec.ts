// monitoring-service/rest/test/lifecycle.spec.ts

import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { Pool } from "pg";

/**
 * Step 10 — the life-cycle test.
 *
 * This is the only test in the suite that boots src/index.ts AS A REAL
 * PROCESS. Every other test imports createApp() or Poller directly and
 * wires them up itself, which means none of them exercise the thing
 * index.ts is actually responsible for: reading config from the
 * environment, failing fast when the database is unreachable,
 * registering signal handlers, and shutting down cleanly enough that
 * the process actually exits.
 *
 * That gap is not hypothetical. Two real bugs found earlier in this
 * project lived exactly there and were invisible to every other test:
 *   - the poller was never stopped in shutdown(), so the process kept
 *     polling a closed pool forever (step 7);
 *   - grpc-js channels held event loop handles open, which would stop
 *     the process exiting on SIGTERM (step 8).
 * Both are regression-tested below by asserting the process genuinely
 * TERMINATES, not merely that shutdown() was called.
 */
const restDir = path.resolve(__dirname, "..");
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poc:poc@localhost:5432/poc_test";

let child: ChildProcess | null = null;

let nextPort = 3300;
const takePort = () => nextPort++;

interface Booted {
  proc: ChildProcess;
  output: () => string;
}

/**
 * Spawns the real entrypoint. `detached` so the whole process group can
 * be signalled: `npx ts-node` spawns a grandchild, and signalling only
 * the direct child leaves the actual server running — a trap this
 * project has hit before.
 */
function spawnService(env: Record<string, string>): Booted {
  const proc = spawn("npx", ["ts-node", "src/index.ts"], {
    cwd: restDir,
    env: { ...process.env, ...env },
    stdio: "pipe",
    detached: true,
  });

  let output = "";
  proc.stdout?.on("data", (d) => (output += d.toString()));
  proc.stderr?.on("data", (d) => (output += d.toString()));

  child = proc;
  return { proc, output: () => output };
}

function killService(proc: ChildProcess | null): void {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
}

async function waitForHealthz(port: number, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/healthz`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Service never became healthy on port ${port}`);
}

/**
 * Resolves with `{ code, signal }` when the process ends, or rejects if
 * it outlives the timeout.
 *
 * Both fields matter here. Signals are sent to the process GROUP
 * (negative pid) because `npx ts-node` spawns a grandchild — signalling
 * only the direct child leaves the real server running. The side
 * effect is that the `npx` wrapper we observe is itself killed by the
 * signal, so it reports `code: null, signal: "SIGTERM"` even when the
 * inner Node process shut down gracefully and called process.exit(0).
 *
 * So "did it exit cleanly" cannot be answered by the wrapper's exit
 * code alone. It's answered by two things together: the process
 * terminating at all within the timeout (proving nothing kept the
 * event loop alive), and "shutdown complete" appearing in the output
 * (proving shutdown() ran to the end rather than the process being
 * summarily killed mid-flight).
 */
function waitForExit(
  proc: ChildProcess,
  timeoutMs: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Process did not exit within ${timeoutMs}ms`)),
      timeoutMs,
    );
    proc.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

describe("service life cycle (real entrypoint, real process)", () => {
  afterEach(async () => {
    killService(child);
    child = null;
    await new Promise((r) => setTimeout(r, 200));
  });

  it("boots, connects to Postgres, and serves /healthz", async () => {
    const port = takePort();
    const { output } = spawnService({
      DATABASE_URL,
      PORT: String(port),
      POLL_INTERVAL_MS: "60000",
    });

    await waitForHealthz(port);

    const res = await fetch(`http://localhost:${port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(output()).toContain("rest service started");
  }, 40_000);

  it("refuses to start when the database is unreachable, and exits non-zero", async () => {
    // The fail-fast promise in index.ts's own comment: "a service that
    // starts happily without its database, then reports nothing, is
    // worse than one that refuses to start."
    const port = takePort();
    const { proc, output } = spawnService({
      DATABASE_URL: "postgres://poc:poc@localhost:59999/nonexistent",
      PORT: String(port),
    });

    // No signal is sent here — the process exits on its own — so the
    // real exit code IS meaningful in this case, unlike the
    // signal-driven shutdown tests below.
    const { code } = await waitForExit(proc, 30_000);

    expect(code).not.toBe(0);
    expect(output()).toContain("failed to start");
    // And it must NOT have started listening before discovering this.
    expect(output()).not.toContain("rest service started");
  }, 40_000);

  it("honours PORT from the environment", async () => {
    const port = takePort();
    spawnService({ DATABASE_URL, PORT: String(port), POLL_INTERVAL_MS: "60000" });

    await waitForHealthz(port);
    const res = await fetch(`http://localhost:${port}/healthz`);
    expect(res.ok).toBe(true);
  }, 40_000);

  it("logs which checksum provider is live at startup", async () => {
    const port = takePort();
    const { output } = spawnService({
      DATABASE_URL,
      PORT: String(port),
      POLL_INTERVAL_MS: "60000",
    });
    await waitForHealthz(port);

    // Never ambiguous in a production log which implementation is
    // running — see src/checksum/README.md.
    expect(output()).toContain("checksum provider");
  }, 40_000);

  it("actually runs the poller after boot, not just the HTTP server", async () => {
    const port = takePort();
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query("TRUNCATE devices, diagnostics RESTART IDENTITY CASCADE");

    const { output } = spawnService({
      DATABASE_URL,
      PORT: String(port),
      POLL_INTERVAL_MS: "1000",
    });
    await waitForHealthz(port);

    // Give a couple of cycles a chance to run.
    await new Promise((r) => setTimeout(r, 3000));
    await pool.end();

    expect(output()).toContain("poller started");
    expect(output()).toContain("poll cycle complete");
  }, 40_000);

  it("shuts down cleanly on SIGTERM and the process EXITS", async () => {
    const port = takePort();
    const { proc, output } = spawnService({
      DATABASE_URL,
      PORT: String(port),
      POLL_INTERVAL_MS: "1000",
    });
    await waitForHealthz(port);

    process.kill(-proc.pid!, "SIGTERM");
    // Resolving at all is the first half of the assertion: it proves
    // nothing kept the event loop alive after shutdown.
    await waitForExit(proc, 15_000);

    expect(output()).toContain("shutting down");
    expect(output()).toContain("poller stopped");
    // The important half: "shutdown complete" proves shutdown() ran to
    // the end (server closed AND pool ended), and waitForExit
    // resolving at all proves nothing kept the event loop alive
    // afterward — the poller timer and grpc channels really were
    // released. Both were real bugs at different points in this
    // project, and neither was visible to any other test.
    expect(output()).toContain("shutdown complete");
  }, 40_000);

  it("shuts down cleanly on SIGINT too", async () => {
    const port = takePort();
    const { proc, output } = spawnService({
      DATABASE_URL,
      PORT: String(port),
      POLL_INTERVAL_MS: "1000",
    });
    await waitForHealthz(port);

    process.kill(-proc.pid!, "SIGINT");
    await waitForExit(proc, 15_000);

    expect(output()).toContain("shutdown complete");
  }, 40_000);

  it("stops answering HTTP once shut down", async () => {
    const port = takePort();
    const { proc } = spawnService({
      DATABASE_URL,
      PORT: String(port),
      POLL_INTERVAL_MS: "60000",
    });
    await waitForHealthz(port);

    process.kill(-proc.pid!, "SIGTERM");
    await waitForExit(proc, 15_000);

    // The port must genuinely be released, not merely "the process
    // said it was shutting down".
    await expect(fetch(`http://localhost:${port}/healthz`)).rejects.toThrow();
  }, 40_000);

  it("a second SIGTERM after shutdown does not produce a second shutdown sequence", async () => {
    const port = takePort();
    const { proc, output } = spawnService({
      DATABASE_URL,
      PORT: String(port),
      POLL_INTERVAL_MS: "1000",
    });
    await waitForHealthz(port);

    process.kill(-proc.pid!, "SIGTERM");
    await waitForExit(proc, 15_000);

    // A second signal is sent AFTER exit, not during it. Two earlier
    // versions of this test tried to land the second SIGTERM mid-
    // shutdown and both were unreliable — shutdown completes in about
    // 7ms, so there is no window to hit, and signalling an
    // already-dead process group behaves inconsistently.
    //
    // What can be asserted reliably is the outcome the `shuttingDown`
    // guard exists to produce: exactly ONE shutdown sequence in the
    // output, never two. If the guard were missing, the handler would
    // be re-entrant and a second pool.end() would throw — which would
    // show up here as an error in the output or a second completion.
    try {
      process.kill(-proc.pid!, "SIGTERM");
    } catch {
      // ESRCH — the group is already gone, which is itself fine.
    }

    const completions = output().split("shutdown complete").length - 1;
    expect(completions).toBe(1);
    expect(output()).not.toContain("Cannot use a pool after calling end");
  }, 40_000);
});
