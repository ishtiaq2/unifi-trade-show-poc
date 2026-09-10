# monitoring-service

The Node.js/TypeScript backend. See [`../docs/`](../docs/) for the
requirements and design this was built against.

## Layout

```
src/
├── domain/      pure logic — state machine, backoff, structured logger
├── clients/     DeviceClient interface, REST + gRPC implementations, factory
├── checksum/    ChecksumProvider interface + stub
├── repo/        Postgres access
├── service/     orchestration — registration, discovery, queries
├── poller/      scheduled checks, retries, state transitions
├── http/        Express API
├── config/      environment configuration
└── index.ts     startup and graceful shutdown
```

Two interfaces carry the design:

```
Poller ──► DeviceClient      ──► RestDeviceClient   (complete)
                              └─► GrpcDeviceClient   (mock-verified)

Poller ──► ChecksumProvider  ──► StubChecksumProvider (binary unavailable)
```

Both are the parts the brief says arrive later. Nothing above them knows
which protocol a device speaks or where a checksum comes from, so
completing either is a one-file change.

## Commands

```bash
npm run dev         # ts-node, for development
npm run build       # compile to dist/ (+ copies device.proto)
npm start           # run the compiled build
npm run seed        # register the 6 simulators via the real API
npm test            # 26 tests
npm run typecheck
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_URL` | `postgres://poc:poc@localhost:5432/poc` | Postgres connection |
| `POLL_INTERVAL_MS` | `10000` | How often every device is checked |
| `FAILURE_THRESHOLD` | `3` | Consecutive failures before `down` |

`FAILURE_THRESHOLD` and `POLL_INTERVAL_MS` are environment settings
rather than constants on purpose: the venue's network is an unknown, and
tuning it there must not require editing and redeploying code.

## Tests

| Suite | Tests | Scope |
|---|---|---|
| `stateMachine.spec.ts` | 8 | Pure functions, no I/O. Highest-stakes logic in the repo |
| `api.test.ts` | 9 | HTTP against a real Postgres |
| `integration.test.ts` | 5 | Real running simulators, both protocols, real sockets |
| `lifecycle.test.ts` | 4 | The real `src/index.ts` as a subprocess, real SIGTERM shutdown |

Requires `TEST_DATABASE_URL` (defaults to `.../poc_test`).

Nothing about the transport or database layer is mocked. A mocked
repository can only confirm the code calls the methods the test expects —
it cannot catch a malformed query or a proto field-casing mismatch, which
are the failures that actually occur at those layers.

## Flaky tests found and fixed

Four separate flakes were found by running the suite repeatedly rather
than once. Recorded because how a flaky test gets resolved says more than
whether the suite is currently green — none was fixed by adding a sleep.

Both were defects in how the tests *observed* the system, not in the
system. Recorded because how a flaky test gets resolved says more than
whether the suite is green.

**Port reuse across integration tests.** `npx ts-node` spawns a
grandchild process that survives `kill()` on the direct child, so
simulators leaked between tests and held their ports. Two tests failed in
ways that looked like protocol bugs — a device reporting `ok` when the
test configured `degraded` — but were really the previous test's
simulator still answering. Fixed with a unique port per test and
process-group kills, not with sleeps.

**Racing the state machine.** The life-cycle test originally polled the
API on a timer to observe the `suspect` state, and with a 300ms poll
interval could sample straight past it. The state machine's unit tests
prove independently that `suspect` cannot be skipped, so the system was
correct. Fixed by asserting against the poller's emitted structured
transition logs, which removes the race rather than widening the window.

**Cross-suite database interference.** Vitest runs test files in parallel
by default. Several suites share one Postgres database and `TRUNCATE` it
between tests, so `api.test.ts` could delete rows the life-cycle suite
had just registered through the running service — surfacing as "the
device never reached down". Fixed with `fileParallelism: false` in
`vitest.config.ts`. A database per suite is the better answer at larger
scale; noted there as a change worth making if the suite grows.

**A non-deterministic device fixture.** The life-cycle test originally
used the simulator's `goes-down` mode, which fails after N requests. But
the readiness probe and capability discovery each consume requests from
that same counter, so how much life the device had left when polling
began varied between runs — producing `reachable`, `suspect` or `down`
depending on timing. Fixed by killing the device process outright:
connection refused is unambiguous, and it models a device losing power
at the venue more honestly than a request budget does.

## Known gaps

- **gRPC client is mock-verified only** — no gRPC hardware exists
  (`../docs/assumptions.md` #2).
- **`ChecksumProvider` is a stub** returning `null`
  (`../docs/assumptions.md` #3). The real implementation will likely
  spawn the binary with a timeout and degrade to `null` on failure, so a
  broken checksum tool cannot take monitoring down with it.
- **The Docker build has not been executed** — no registry access in the
  development environment. `npm run build` and `node dist/index.js` were
  verified directly.
- **No historical diagnostics endpoint** — the table accumulates
  snapshots, so the data exists; only the query API is missing.
