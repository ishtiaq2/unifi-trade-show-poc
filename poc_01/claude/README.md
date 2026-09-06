# Device Monitoring Service — Trade Show PoC

**Status:** device simulators and database schema are built and verified.
`monitoring-service/` (the actual graded deliverable) is next.

## Start here

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

## Layout

```
db/                 — Postgres schema (verified against a real Postgres 16 instance)
devices/            — 6 mock device simulators (REST + gRPC), see devices/README.md
monitoring-service/ — the Node.js backend service (not yet built)
docker-compose.yml  — brings up Postgres + all 6 devices together
```

## Running what exists so far

```bash
# Database
psql -f db/init.sql   # or: docker compose up db

# Any device simulator
cd devices && npm install
node router/index.js               # REST
node camera-grpc/index.js          # gRPC
```

## AI usage

See [`AI_USAGE.md`](AI_USAGE.md) — updated as implementation proceeds,
not written retroactively.
