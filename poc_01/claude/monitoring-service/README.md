# monitoring-service

The Node.js/TypeScript backend for the trade-show device monitoring PoC.
See `../docs/` for the requirements, assumptions, and specification this
was built against.

## Architecture

```
src/
├── domain/        — pure logic: state machine, backoff (no I/O, fully unit-tested)
├── clients/        — DeviceClient interface + REST/gRPC implementations
├── checksum/        — ChecksumProvider interface + stub (real binary not available yet)
├── repo/             — Postgres repository
├── service/          — orchestration: registration, capability discovery, queries
├── poller/            — scheduled health checks, retry/backoff, state transitions
├── http/               — Express API
└── index.ts             — real startup/shutdown sequence
```

Every arrow in this diagram is an interface, not a concrete dependency,
at the two points the brief explicitly said would change later:

```
Poller ──uses──> DeviceClient (interface) ──implemented by──> RestDeviceClient
                                             └──implemented by──> GrpcDeviceClient (stub)

Poller ──uses──> ChecksumProvider (interface) ──implemented by──> StubChecksumProvider
```

## Running it

```bash
npm install
export DATABASE_URL=postgres://poc:poc@localhost:5432/poc
npm run dev              # starts on :3000

# in another terminal, with device simulators running (see ../devices):
npm run seed              # registers all 6 devices via the real API
```

## Testing

```bash
npm test                  # everything
npm run test:lifecycle     # just the life-cycle suite
```

Three layers, deliberately not overlapping in what they cover:

- **`test/stateMachine.test.ts`** — pure logic, no I/O. The single most
  important test file in this repo: it directly proves "unstable
  networks, don't want false alarms" (a flaky failure pattern never
  reaches `down`) and that real, sustained failure still gets detected.
- **`test/app.test.ts`** — HTTP + a real Postgres (not mocked), covering
  status codes and the "device registers even if unreachable at
  registration time" resilience path.
- **`test/lifecycle.test.ts`** — boots the actual entrypoint
  (`src/index.ts`, unmodified) against a real Postgres and a real running
  device simulator, drives it through a real reachable→suspect→down
  transition, and shuts it down via the real SIGTERM handler. This is the
  suite that answers `docs/assumptions.md` #1.

## A test that was flaky, and why

The first version of the life-cycle test asserted "suspect was observed
before down" by polling the API on a timer. It failed intermittently once
run alongside the rest of the suite — not because the state machine
skipped a state (the unit tests independently prove it can't), but
because the test's own read interval could race past the single
`suspect` window between two poll cycles under load. Fixed by asserting
against the poller's own structured transition logs instead of polling
reads — this removed the race entirely rather than papering over it with
longer timeouts. See `test/lifecycle.test.ts` for the full comment.

## Verified manually, live (not just via automated tests)

With `POLL_INTERVAL_MS=1000` and `FAILURE_THRESHOLD=3` against the real
`door-access-rest` simulator: `reachable` for 4 seconds, `suspect` for 2
seconds, `down` from t=7s onward — never a single-failure jump straight
to down. Structured JSON log lines confirm the same transitions.

## Known gaps / next steps

- **gRPC client is stubbed**, proven against the mock gRPC devices only
  (per `docs/assumptions.md` #2) — no real gRPC hardware exists in this
  scenario to validate against.
- **ChecksumProvider is a stub** returning `null` (per
  `docs/assumptions.md` #3) — the real binary doesn't exist yet; the
  interface is the actual deliverable here, not a working checksum.
- **No auth on the API** — internal trade-show tool, not a public
  product (see `docs/non-goals.md`).
- **Capability re-discovery** for devices stuck with `protocol: null`
  (e.g. the flaky camera failing its very first health check at
  registration) happens lazily on the next poll cycle — verified working
  in the manual demo run, but there's no dedicated automated test for
  this specific recovery path yet. Worth adding.
