# Life-Cycle Test — Step 10

`test/lifecycle.spec.ts` — the only test that boots `src/index.ts`
**as a real process**.

## The gap this closes

Every other test in the suite imports `createApp()` or `Poller`
directly and wires them up itself. None of them exercise what
`index.ts` is actually responsible for:

- reading config from the environment
- failing fast when the database is unreachable
- registering SIGTERM/SIGINT handlers
- shutting down cleanly enough that **the process actually exits**

That gap is not hypothetical. Two real bugs in this project lived
exactly there and were invisible to all 62 other tests:

| Bug | Step | Symptom |
|---|---|---|
| `poller.stop()` missing from `shutdown()` | 7 | kept polling a closed pool forever |
| grpc-js channels never closed | 8 | event loop handles held open, process wouldn't exit |

Both are now regression-tested by asserting the process **terminates**,
not merely that `shutdown()` was called.

**Proved it catches them:** I reintroduced the exact step 7 bug
(commented out `poller.stop()`) and re-ran. The SIGTERM test failed,
as it should. Restored, 9/9 green again. A regression test that's
never seen the regression isn't proven to work.

## What it covers

| Test | Proves |
|---|---|
| boots and serves `/healthz` | config → pool → listen actually works end to end |
| refuses to start with an unreachable DB | the fail-fast promise in index.ts's own comment |
| honours `PORT` from the environment | config is really read, not hardcoded |
| logs which checksum provider is live | step 9's "never ambiguous in a log" claim |
| runs the poller after boot | the service isn't just an HTTP server |
| SIGTERM → clean shutdown, process exits | the step 7 + 8 regressions |
| SIGINT → same | both handlers registered, not just one |
| stops answering HTTP after shutdown | the port is genuinely released |
| double SIGTERM → one shutdown | the `shuttingDown` guard works |

## A real subtlety: the exit code is `null`, and that's correct

The first version of this test asserted `exitCode === 0` after SIGTERM
and failed with `expected null to be +0`. That looked like a shutdown
bug. It wasn't — diagnosing it directly showed a full clean shutdown
in the logs:

```
{"msg":"shutting down"}
{"msg":"poller stopped"}
{"msg":"shutdown complete"}
EXIT code= null  signal= SIGTERM
```

The cause: signals go to the process **group** (negative pid), because
`npx ts-node` spawns a grandchild and signalling only the direct child
leaves the real server running. The side effect is that the `npx`
wrapper being observed is itself killed by the signal, so Node reports
*the wrapper's* death-by-signal rather than the inner process's clean
`process.exit(0)`.

So "did it shut down cleanly" can't be answered by the wrapper's exit
code. It's answered by two things together:

1. **The process terminates at all** within the timeout — proving
   nothing kept the event loop alive (this is what catches the poller
   and grpc-channel bugs).
2. **`shutdown complete` appears in the output** — proving `shutdown()`
   ran to the end rather than the process being summarily killed
   mid-flight.

The fail-fast test is the exception: no signal is sent there, the
process exits on its own, so its real exit code *is* meaningful and is
asserted directly.

## Running it

```bash
cd monitoring-service/rest
export TEST_DATABASE_URL=postgres://poc:poc@localhost:5432/poc_test
npx vitest run test/lifecycle.spec.ts    # 9 tests, ~18s
npm test                                  # full suite, 71 tests
```

Needs a real Postgres. Doesn't need devices running — it polls an
empty device list, which is enough to prove the poller cycles.

Each test uses its own port (3300+) so a leftover process from a
failed run can't silently make the next one pass against the wrong
service.

## Verified

- 9/9 pass; **71/71 total**, no regressions from step 9's 62.
- Typechecks clean under `strict: true`.
- Confirmed to catch a real regression, not just pass: reintroducing
  the step 7 `poller.stop()` bug fails the SIGTERM test.
