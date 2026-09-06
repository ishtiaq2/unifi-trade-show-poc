# Specification

Technical design for the device monitoring PoC. This is a starting point
to build against — expected to shift slightly once real code surfaces
edge cases the design didn't anticipate.

## Architecture overview

```
                     ┌───────────────────┐
                     │   REST API layer   │  ← GET /devices, /devices/:id,
                     │  (thin, no logic)   │     POST/DELETE /devices (registry mgmt)
                     └─────────┬─────────┘
                               │
                     ┌─────────▼─────────┐
                     │   Device Service    │  ← orchestration, state transitions
                     └───┬─────────────┬──┘
                         │             │
             ┌───────────▼──┐     ┌────▼────────────┐
             │ Device Client │     │  Checksum        │
             │  (interface)  │     │  Provider        │
             │               │     │  (interface)     │
             │ ├─ REST impl  │     │ └─ Stub impl     │
             │ └─ gRPC impl  │     │    (binary not    │
             │    (stub)     │     │    available yet)│
             └───────────────┘     └──────────────────┘
                         │
                     ┌───▼────┐
                     │ Poller  │  ← scheduled health checks, retry/backoff,
                     │         │     reachable/suspect/down state machine
                     └───┬────┘
                         │
                     ┌───▼─────────┐
                     │  Postgres    │  ← device registry + latest known status
                     └──────────────┘
```

Layering rationale: the `DeviceClient` and `ChecksumProvider` interfaces
are the two seams the brief explicitly told us will be replaced later
(gRPC devices, the real checksum binary). Everything else in the system
talks to those interfaces, never to a concrete REST/gRPC/binary detail —
so "plug that in later" is a one-file change, not a refactor.

## Device state machine

```
        successful check           N consecutive failures
 reachable ───────────────► reachable      suspect ─────────────► down
     ▲                          │  ▲                                │
     │      1 failure           │  │        successful check        │
     └──────────────────────────┘  └────────────────────────────────┘
```

- `reachable`: last check succeeded.
- `suspect`: 1+ failures, but under the configured threshold — not yet
  reported as down. This is the direct answer to "unstable networks,
  don't want false alarms."
- `down`: failures exceeded the threshold within the configured window.
- A single success from any state returns the device to `reachable`
  immediately — recovery isn't gated the way failure is, since a false
  "still down" is a different (lesser) cost than a false alarm.
- Threshold, window, and backoff curve are config, not constants (see
  `assumptions.md` #4).

## Capability discovery

Per the brief's "use its health endpoint to get the capabilities": each
device's health endpoint is queried once at registration time (and
re-checked on a longer interval, in case firmware updates change
capabilities) to determine which protocol and diagnostics fields it
supports. The result is cached against the device record, so the poller
doesn't re-negotiate protocol on every single health check.

## Data model (Postgres)

```
devices
-------
id              uuid primary key
name            text
address         text            -- host:port or URL, protocol-agnostic
protocol        text            -- 'rest' | 'grpc', set after capability discovery
capabilities     jsonb           -- raw capability response, for debugging/audit
status          text            -- 'reachable' | 'suspect' | 'down'
consecutive_failures  int
last_checked_at  timestamptz
last_success_at  timestamptz
created_at       timestamptz
updated_at       timestamptz

diagnostics
-----------
device_id        uuid references devices(id)
hw_version       text
sw_version       text
fw_version       text
checksum         text            -- from ChecksumProvider; nullable while stubbed
recorded_at      timestamptz
```

`diagnostics` is separate from `devices` rather than columns bolted onto
the device row, since diagnostics are a point-in-time snapshot and the
device row represents current state — keeping them apart avoids
overwriting history the moment a new diagnostics read comes in for
something the demo/audit might want later (see `non-goals.md` re: full
time-series, deliberately not built now, but not architecturally blocked
either).

## API (draft)

```
GET    /devices                    → latest known state of every device
GET    /devices/:id                → one device, including latest diagnostics
POST   /devices                    → register a new device { name, address }
DELETE /devices/:id                → stop monitoring a device
GET    /healthz                    → service's own health, for the trade-show host to check
```

Error shape, consistent across all endpoints:

```json
{ "error": { "code": "DEVICE_NOT_FOUND", "message": "..." } }
```

## Reliability behavior

- Retries: exponential backoff with jitter, bounded (a fixed max attempt
  count per check cycle, not infinite retry) — bounded so a single flaky
  device can't monopolize the poller's capacity.
- Timeouts: explicit per-request timeout, shorter than the poll interval,
  so a hung request can't cause checks to pile up.
- Logging: structured (JSON), one log line per state *transition*
  (reachable→suspect, suspect→down, down→reachable) rather than one line
  per check — a device being fine for an hour shouldn't produce an hour
  of identical log lines.

## Deployment & developer experience

- `docker-compose.yml` bringing up the service + Postgres together —
  directly answers "must be able to get it up and running quick and
  easy" on unknown trade-show hardware.
- A seed script populating a handful of mock devices (mix of
  reachable/suspect/down, REST and the gRPC stub) so the API returns
  something meaningful within seconds of first boot — nobody at a trade
  show wants to configure real devices before seeing anything work.
- One command to run the full life-cycle test (see `assumptions.md` #1)
  against a real containerized Postgres.

## Testing strategy (summary — full detail once code exists)

- Unit: state machine transitions, backoff calculation, capability
  parsing — pure logic, no I/O.
- Integration: `DeviceClient` implementations against a mock device
  server (REST and gRPC).
- Life-cycle: boots the real entrypoint against a containerized Postgres,
  registers a device, drives it through reachable → suspect → down →
  reachable, asserts on the API's view at each stage, then shuts down
  cleanly. This is the test suite directly answering assumption #1.
