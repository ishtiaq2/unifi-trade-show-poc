# Device Monitoring Service — Trade Show PoC

**Status:** implementation complete. 19/19 tests passing, including a
full life-cycle test that boots the real service against real Postgres
and a real running device simulator, plus manual end-to-end demo runs
across both REST and gRPC.

**Reviewers start here:** [`REPLY_TO_BOSS.md`](REPLY_TO_BOSS.md) — the
short reply, written as it would actually be sent.

## Start here

- [`REPLY_TO_BOSS.md`](REPLY_TO_BOSS.md) — the reply to the boss
- [`AI_USAGE.md`](AI_USAGE.md) — where and why AI assistance was used
- [`docs/requirements.md`](docs/requirements.md) — what was asked for,
  explicit and implied, with priority
- [`docs/assumptions.md`](docs/assumptions.md) — every ambiguous point in
  the brief, the interpretation chosen, and why
- [`docs/specification.md`](docs/specification.md) — architecture, data
  model, API contract, reliability behavior
- [`docs/non-goals.md`](docs/non-goals.md) — what was deliberately left
  out, and why
- [`devices/README.md`](devices/README.md) — the 6 mock device
  simulators standing in for real trade-show hardware
- [`monitoring-service/README.md`](monitoring-service/README.md) — the
  service itself: architecture, testing strategy, and a real flaky test
  that got fixed, not hidden

## Layout

```
db/                 — Postgres schema (verified against a real Postgres 16 instance)
devices/            — 6 mock device simulators (REST + gRPC), see devices/README.md
monitoring-service/ — the Node.js backend (implemented, tested, verified live)
docker-compose.yml  — brings up Postgres + monitoring-service together
```

## Running the whole thing

```bash
docker compose up   # brings up Postgres + monitoring-service + all 6 device simulators together
```

Or run each piece individually:

```bash
# Database
docker compose up db -d
# or locally: createdb poc && psql -d poc -f db/init.sql

# Monitoring service
cd monitoring-service && npm install
export DATABASE_URL=postgres://poc:poc@localhost:5432/poc
npm run dev

# Device simulators, each in its own terminal (or see devices/README.md)
cd devices && npm install
node router/index.js
node camera-grpc/index.js
# ...etc

# Register the devices via the real API
cd monitoring-service && npm run seed

curl http://localhost:3000/devices
```

## AI usage

See [`AI_USAGE.md`](AI_USAGE.md) — updated as implementation proceeded,
not written retroactively.
