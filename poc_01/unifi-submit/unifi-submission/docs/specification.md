# Specification

## Architecture

```
                        HTTP clients (curl, demo screen)
                                    │
                        ┌───────────▼────────────┐
                        │      HTTP layer         │  validation, status codes,
                        │      src/http/          │  one central error mapper
                        └───────────┬────────────┘
                                    │
                        ┌───────────▼────────────┐
                        │    Service layer        │  registration, discovery,
                        │    src/service/         │  queries
                        └───────┬────────┬───────┘
                                │        │
              ┌─────────────────▼──┐  ┌──▼──────────────────┐
              │     Poller          │  │   Repository        │
              │  src/poller/        │  │   src/repo/         │
              │  retries, backoff,  │  └──────────┬──────────┘
              │  state transitions  │             │
              └───┬─────────────┬──┘   ┌──────────▼──────────┐
                  │             │       │     Postgres        │
      ┌───────────▼──┐   ┌──────▼─────────────┐               │
      │ DeviceClient  │   │ ChecksumProvider   │               │
      │ (interface)   │   │ (interface)        │               │
      │ ├─ REST ✅    │   │ └─ Stub (binary    │               │
      │ └─ gRPC 🔶    │   │    not available)  │               │
      └───────┬───────┘   └────────────────────┘               │
              │                                                 │
     ┌────────▼─────────┐                                       │
     │ Physical devices  │                                       │
     │ (simulated)       │                                       │
     └───────────────────┘
```

The two interfaces are the load-bearing design decision. The brief says
both gRPC devices and the checksum binary arrive later, so both are
abstractions today — the poller and service layer are written without
knowing which protocol a device speaks or where a checksum comes from.

## Device state machine

```
                   check succeeds
        ┌──────────────────────────────────┐
        │                                  │
        ▼          failure                 │
   ┌─────────┐  ───────────►  ┌─────────┐  │
   │reachable│                │ suspect │──┘
   └─────────┘  ◄───────────  └────┬────┘
        ▲          success          │ failures ≥ threshold
        │                           ▼
        │         success      ┌─────────┐
        └──────────────────────│  down   │
                               └─────────┘
```

Recovery is immediate from any state; failure requires accumulated
evidence. Reasoning in `assumptions.md` #4.

Two independent guards operate at different timescales:

| Mechanism | Scope | Absorbs |
|---|---|---|
| Bounded retries with jittered backoff | within one check cycle | a dropped packet, a momentary blip |
| reachable → suspect → down threshold | across cycles | a device having a bad few minutes |

Neither is sufficient alone. Retries alone still flip a device to `down`
once a blip outlasts the retry budget; the threshold alone wastes whole
cycles on failures a single retry would have cured.

Full jitter (uniform `0..delay`, not a fixed delay) matters specifically
here: a flaky venue network makes many devices fail at once, and fixed
delays would synchronise every retry onto the same tick.

## Capability discovery

Per the brief's "use its health endpoint to get the capabilities":

1. On registration, try REST `GET /health` (the required protocol).
2. On failure, try gRPC `GetHealth` (the "ideally" protocol).
3. Persist the resolved protocol and the raw capability response.
4. If both fail, leave `protocol` null; the poller retries discovery on
   later cycles (`assumptions.md` #10).

Protocol is cached on the device row so the poller does not renegotiate
on every check.

## Data model

```
devices                              diagnostics
─────────────────────────            ────────────────────────────────
id           uuid PK                 id                      uuid PK
name         text                    device_id               uuid FK ──┐
address      text UNIQUE  ◄──────┐   hw_version              text      │
protocol     'rest'|'grpc'       │   sw_version              text      │
capabilities jsonb               │   fw_version              text      │
status       'reachable'|        │   device_reported_status  text      │
             'suspect'|'down'    │   checksum                text      │
consecutive_failures int         │   recorded_at             timestamptz
last_checked_at  timestamptz     │                                     │
last_success_at  timestamptz     └─────────────────────────────────────┘
created_at / updated_at
```

Two decisions worth stating:

- **`devices.status` and `diagnostics.device_reported_status` are
  different columns on purpose.** One is our verdict, one is the
  device's claim about itself (`assumptions.md` #8).
- **Diagnostics are append-only snapshots, separate from the device
  row.** A device row is current state; a diagnostics row is a
  point-in-time reading. Keeping them apart means a new reading does not
  overwrite history the brief may want to inspect offline later.

Indexes: `(device_id, recorded_at DESC)` serves "latest diagnostics for
this device", the dominant read. `devices(status)` serves "show me
everything unhealthy", the query an operator actually runs.

## API

| Method | Path | Purpose | Codes |
|---|---|---|---|
| `GET` | `/healthz` | service liveness, touches no dependencies | 200 |
| `GET` | `/devices` | latest status of every monitored device | 200 |
| `GET` | `/devices/:id` | one device plus its latest diagnostics | 200, 404 |
| `POST` | `/devices` | register and discover capabilities | 201, 400, 409 |
| `DELETE` | `/devices/:id` | stop monitoring | 204, 404 |

Consistent error shape everywhere:

```json
{ "error": { "code": "DEVICE_NOT_FOUND", "message": "..." } }
```

Status codes are mapped in exactly one place (the Express error
middleware). Scattering that across handlers is how a 404 becomes a 500.

## Reliability

- **Timeouts** — 2s per request, well below the poll interval, so a hung
  request cannot let checks pile up.
- **Retries** — bounded (3 attempts), never unbounded: one badly behaved
  device must not starve every other device's check.
- **Cycle overlap guard** — if a cycle is still running when the next
  tick fires, the tick is skipped rather than stacking a second sweep.
- **Fail-fast startup** — the service refuses to start without its
  database. A monitoring service that starts happily and then reports
  nothing is worse than one that will not start, because silence looks
  like success.
- **Graceful shutdown** — SIGTERM and SIGINT both stop the poller, close
  the HTTP server and drain the connection pool.

## Logging

Structured single-line JSON, at levels. One line per state
**transition**, not per check: a healthy device polled every 10 seconds
would otherwise emit 8,640 identical lines a day and bury the handful
that matter. `down` logs at error, `suspect` at warn, recovery at info.

## Testing strategy

| Suite | Scope | Why it exists |
|---|---|---|
| `stateMachine.spec.ts` | pure functions, no I/O | The false-alarm logic is the highest-stakes code here; these run in milliseconds and can be exhaustive |
| `api.test.ts` | HTTP + real Postgres | Catches malformed queries, wrong column names, constraints that do not behave as assumed — none visible to a mocked repository |
| `integration.test.ts` | real simulators, both protocols, real sockets | Catches proto loader mismatches, field-casing bugs, timeouts that never fire |
| `lifecycle.test.ts` | the real entrypoint as a subprocess | Answers `assumptions.md` #1 — proves the wired-together service works, not just its parts |

## Deployment

`docker compose up` starts Postgres (schema auto-applied), the
monitoring service, and all six device simulators. This is the direct
answer to "get it up and running quick and easy" on an unknown host OS.
