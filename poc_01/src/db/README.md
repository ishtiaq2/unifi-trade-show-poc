# In one go: 
cd db
podman-compose down -v   # -v is what actually removes the schema/data
podman-compose up -d
./postgres/verify.sh


# Database Module

Postgres and its schema, self-contained. Runs on its own — no
dependency on the device simulators or the monitoring service.

```
db/
├── docker-compose.yml     just Postgres
├── readme.md              this file
└── postgres/
    ├── init.sql           the schema, applied automatically on first start
    └── verify.sh          proves the schema WORKS, not just that it exists
```

## Quick start

```bash
cd db
docker compose up -d

* How to Test
- PSQL="podman exec -i unifi-db psql" ./postgres/verify.sh
- sudo dnf install -y postgresql


./postgres/verify.sh
```

Expected:

```
13 passed, 0 failed
```

### Manual Testing
```bash
podman exec -it unifi-db psql -U poc -d poc -c "\dt"
podman exec -it unifi-db psql -U poc -d poc -c "\d devices"
podman exec -it unifi-db psql -U poc -d poc -c "\d diagnostics"
podman exec -it unifi-db psql -U poc -d poc -c "select * from devices"
```
Without containers:

```bash
createdb poc && psql -d poc -f postgres/init.sql
./postgres/verify.sh
```

`verify.sh` connects over TCP and takes its settings from the
environment, so it runs from any directory:

| Variable | Default |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_USER` | `poc` |
| `DB_NAME` | `poc` |
| `PGPASSWORD` | `poc` |

```bash
DB_HOST=192.168.1.50 DB_NAME=poc_staging ./postgres/verify.sh
```

## The schema

Two tables.

**`devices`** — one row per monitored device, current state.

| Column | Notes |
|---|---|
| `address` | `host:port`, **UNIQUE** — a device can't be registered twice |
| `protocol` | `'rest'` / `'grpc'`, **NULL until discovered** — a device registered while still booting is legitimate |
| `capabilities` | raw discovery response, kept verbatim for debugging |
| `status` | `reachable` / `suspect` / `down` — **this service's verdict** |
| `consecutive_failures` | drives the state machine, can't go negative |

**`diagnostics`** — append-only snapshots, one row per successful reading.

| Column | Notes |
|---|---|
| `device_reported_status` | **the device's own claim about itself** |
| `checksum` | NULL until the external binary exists — never faked |

### The two "status" columns are deliberate

`devices.status` is whether *this service can reach* the device.
`diagnostics.device_reported_status` is what the *device says about
itself*. A switch can be perfectly `reachable` while reporting
`degraded` — collapsing these into one column loses exactly the
information an operator wants, and loses it unrecoverably.

### Why `diagnostics` is a separate table

A device row is current state; a diagnostics row is a point-in-time
reading. Keeping them apart means a new reading never overwrites
history. The index `(device_id, recorded_at DESC)` serves the dominant
query — "latest reading for this device" — without needing a separate
current-diagnostics table to maintain.

## Why `verify.sh` exists

A schema whose constraints silently *don't fire* looks identical to one
that works — until bad data is already in the database. So the script
checks **behavior**, not structure. It attempts to insert:

- a duplicate address
- an invalid status (`'exploded'`)
- an invalid protocol (`'carrier-pigeon'`)
- a negative failure count
- a diagnostics row for a device that doesn't exist

and **fails if the database accepts any of them**.

It was tested against a deliberately broken schema with the constraints
stripped out, to confirm it catches problems rather than always
passing — it correctly reported 5 failures there, and 13/13 against the
real schema. A verification script that has never seen a failure isn't
verification.

Safe to re-run: a cleanup trap removes its test rows on exit, including
on early exit.

## Connecting other services to this database

This module is its own compose project, and **Compose puts each project
on its own network** — so a container started by
`../devices/docker-compose.yml` cannot reach `db` by hostname.

**Option 1 — via the published port.** Anything on the host reaches
Postgres at `localhost:5432`. Works today, nothing to configure:

```
DATABASE_URL=postgres://poc:poc@localhost:5432/poc
```

**Option 2 — via a shared external network.** What the combined stack
will want, since the monitoring service runs in a container itself.
Uncomment the `networks` blocks in `docker-compose.yml`, add the same
to the other compose files, then:

```bash
docker network create unifi-net
```

After that `db:5432` resolves from any container on that network:

```
DATABASE_URL=postgres://poc:poc@db:5432/poc
```

## Gotcha: editing `init.sql` after first start

Postgres only runs files in `/docker-entrypoint-initdb.d/` when its
data directory is **empty**. After the first `docker compose up`,
editing `init.sql` and re-running `up` does nothing — the schema you
see is still the old one.

To re-apply:

```bash
docker compose down -v    # -v removes the pgdata volume
docker compose up -d
```

This costs people a lot of confused debugging time. If `verify.sh`
fails right after you edited the schema, this is almost certainly why.

## Verified

Run, not assumed:

- Schema applies cleanly to an empty database.
- Defaults: a new device is `reachable`, 0 failures, `protocol` NULL.
- All four constraints reject bad data (duplicate address, invalid
  status, invalid protocol, negative failure count).
- Foreign key rejects diagnostics for a non-existent device.
- Cascade delete removes a device's diagnostics with it — verified by
  count, no orphans.
- Append-only history works; the "latest snapshot" query returns the
  most recent row.
- Both indexes exist; `EXPLAIN` confirms `idx_devices_status` is valid
  and usable by the planner.
- `verify.sh` passes 13/13 repeatably, runs correctly from any
  directory, and correctly fails on a broken schema.

**Not verified**: `docker compose up` itself — no container registry
access in the environment this was developed in. The schema was
verified against a real Postgres 16 directly, so the SQL is sound; the
compose path needs confirming on your machine.
