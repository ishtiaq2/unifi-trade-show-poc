# monitoring-service — Steps 4 & 5: REST API + Device Discovery

The HTTP layer over `datasource-module`, now with real capability
discovery against real REST devices.

```
monitoring-service/
├── datasource-module/     step 2's module, unchanged in behavior
│   ├── datasource/sql-service.ts
│   └── domain/types.ts
├── rest/
│   ├── src/
│   │   ├── clients/            step 5 — this update
│   │   │   ├── DeviceClient.ts       the protocol-abstraction interface
│   │   │   ├── RestDeviceClient.ts    real HTTP calls to real devices
│   │   │   └── clientFactory.ts        discoverProtocol() — REST only until step 8
│   │   ├── config/
│   │   ├── domain/logger.ts
│   │   ├── service/             MonitoringService — now calls discoverProtocol
│   │   ├── http/app.ts
│   │   └── index.ts
│   ├── test/
│   │   ├── api.test.ts                  8 tests, real Postgres
│   │   ├── restDeviceClient.test.ts      5 tests, real device processes
│   │   └── discovery.test.ts              1 test, full stack: real HTTP + real device
│   └── Dockerfile
└── docker-compose.yml
```

## What step 5 actually changed

Three new files (`DeviceClient`, `RestDeviceClient`, `clientFactory`),
independently tested against real running device simulators — **before**
touching `MonitoringService` at all. Only once those passed on their own
did `registerDevice` change, and the change is small: call
`discoverProtocol`, persist what it returns, catch failure and leave
`protocol` null exactly as step 4 already did.

This order (client built and proven standalone, then wired in) is what
keeps a step "independently testable" — if discovery had gone straight
into `registerDevice`, a bug could be in the HTTP layer, the service
layer, or the client, and you'd have three places to look. Building and
testing the client alone first eliminates one of those before the
wiring even happens.

## `protocol: null` still happens — now for a real reason, not a stub

Before step 5, `protocol` was *always* null — discovery didn't exist.
Now it's null only when discovery genuinely fails (device unreachable,
still booting). Both `test/api.test.ts` and `test/discovery.test.ts`
assert this distinction directly: one proves null-on-failure, the other
proves `"rest"`-on-success, through the same endpoint.

**Known gap, not yet closed**: if discovery fails at registration, there
is still no poller (that's step 7) to retry it later. A device that
fails discovery today stays at `protocol: null` until someone
re-registers it or step 7 exists. Said plainly rather than left to be
discovered by surprise.

## Run it

```bash
cd datasource-module && npm install
cd ../rest && npm install
export DATABASE_URL=postgres://poc:poc@localhost:5432/poc
npm run dev
```

Containerized — same as step 4, nothing new to configure:

```bash
docker compose up --build
```

## Try it, with a real device running

```bash
# terminal 1
cd devices && npm run router

# terminal 2
curl -X POST localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"router-1","address":"localhost:4001"}'
# protocol:"rest", capabilities populated

# a device that ISN'T running:
curl -X POST localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"ghost","address":"localhost:9999"}'
# still 201, protocol:null
```

## Test it

```bash
cd rest
export TEST_DATABASE_URL=postgres://poc:poc@localhost:5432/poc_test
npm test
```

14 tests total, all against real infrastructure — real Postgres, real
spawned device processes, real HTTP requests through the actual Express
app. Nothing here is mocked.

## Verified

Run, not assumed:

- `RestDeviceClient` tested standalone against real spawned device
  simulators: capability discovery, health checks (success and
  failure), and specifically that the device's wire field `status`
  arrives as `deviceReportedStatus` — the field-rename that matters
  most for not confusing a device's self-report with this service's
  derived status.
- `discoverCapabilities` throws on an unreachable device;
  `checkHealth` never throws, returns `{ok:false}` instead — both
  confirmed directly, not inferred from the interface's doc comments.
- End-to-end: a real device spawned, registered through the real HTTP
  API, `protocol` resolves to `"rest"` and is confirmed persisted via a
  follow-up `GET` (not just present in the `POST` response, which
  could be true even if the database write were silently skipped).
- A full live run outside the test harness — real `router` process,
  real service on a real port, real `curl` — reproduces the same
  result, with the structured log showing the transition.
- One test's timing was fixed after being caught taking 5.6s from a
  readiness probe waiting on a response that, by that device's design,
  never comes; now a fixed short delay, verified against the actual
  process startup time observed elsewhere in the same suite.

**Not verified**: `docker compose up --build` itself — no registry
access in this development environment. Everything the container would
run was verified by running it directly.

## Step Number 6, State Machine:

Step 6: the state machine — `reachable` / `suspect` / `down`, pure
logic, no I/O. Genuinely independent of everything built so far; it can
be written and exhaustively unit-tested without a database, a device,
or an HTTP server anywhere in the loop. Step 7 is where it gets wired to
a poller that finally closes the "discovery never retries" gap noted
above.

* ![state-transitions.svg](../../../../home/ishtiaqh/Downloads/state-machine-integrated/docs/state-transitions.svg)
* ![steps-covered.svg](../../../../home/ishtiaqh/Downloads/state-machine-integrated/docs/steps-covered.svg)
