# Datasource Module

`DeviceRepository` — all SQL for the device monitoring PoC, and an
integration test that runs against a real Postgres.

```
.
├── datasource/
│   ├── sql-monitoringService.ts              DeviceRepository — the only file that knows SQL
│   └── __tests__/
│       └── test-sql-monitoringService.ts      integration test, 25 checks
├── domain/
│   └── types.ts                  Device, Diagnostics, DeviceStatus…
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Run the test

Against a database on your host:

```bash
npm install
npm test
```

Against the `unifi-db` container:

```bash
docker network create unifi-net           # once
# uncomment the networks block in ../db/docker-compose.yml, restart it
docker compose run --rm datasource
```

Expected:

```
25 checks passed
```

Configuration is all environment variables, with sensible defaults:

| Variable | Default |
|---|---|
| `DB_HOST` | `localhost` (compose sets `unifi-db`) |
| `DB_PORT` | `5432` |
| `DB_USER` | `poc` |
| `DB_PASSWORD` | `poc` |
| `DB_NAME` | `poc` |

```bash
DB_HOST=192.168.1.50 npm test
```

## Why the build context is the module root, not `datasource/`

`datasource/sql-service.ts` imports `../domain/types`, and **Docker cannot
`COPY` from outside the build context**. So `docker-compose.yml` sets
`context: .` — the directory containing *both* `datasource/` and
`domain/` — with the Dockerfile copying each in explicitly.

Trying to make `datasource/` its own build root fails with
`COPY failed: forbidden path outside the build context`, which is a
confusing error if you haven't hit it before.

The alternative would be duplicating `types.ts` into this module, but
those types are shared with the poller and HTTP layer later — two
copies would drift.

## Why the test isn't mocked

The entire job of this module is talking to a database. A mocked test
could only confirm the code calls the methods the test expects; it
could not catch a malformed query, a wrong column name, or a constraint
that doesn't behave as assumed — which are exactly the failures that
happen at this layer.

So the test runs against a real Postgres with the real schema from
`../db/postgres/init.sql`. It covers:

- **create** — defaults applied (`reachable`, 0 failures, null protocol)
- **read** — `getDevice`, `findByAddress`, `listDevices`
- **update** — status transitions, and that `last_success_at` is set on
  a successful check but *not* on a failed one (the `CASE WHEN` in the
  UPDATE, which is easy to get backwards)
- **capabilities** — protocol and jsonb round-trip
- **diagnostics** — append-only history, and that `latestDiagnostics`
  returns the *newest* row rather than whichever the database happened
  to return first
- **null checksum** — stored as null, never fabricated
- **delete** — cascade removes diagnostics, and deleting a missing
  device returns `false` rather than throwing

## Two fixes made to the original test

**It exited 0 even when it failed.** The `try/catch` logged the error
and swallowed it, so the process reported success. Verified: with a
leftover row causing a UNIQUE violation, the original printed a stack
trace and still exited `0`. CI, `docker compose run`, and any `&&`
chain would all have treated that as passing.

Now failures reject the promise and `process.exit(1)`. Confirmed
against two real failure modes — an unreachable database and a schema
missing `device_reported_status` — both now exit `1` with a one-line
message.

**It wasn't repeatable.** The test inserted `router:4001`, and if it
failed midway the row survived, so the *next* run failed on the UNIQUE
constraint for an unrelated reason. It now uses a distinctive
`test-harness:4001` address and clears leftovers before starting.

## Note on `router:4001`

The original test used `router:4001` — a real device address from
`devices/docker-compose.yml`. Against a shared database that would
collide with a genuinely registered router. The test now uses
`test-harness:4001` so it can never touch real data.

## Verified

Run, not assumed:

- 25 checks pass against a real Postgres 16 with the real schema.
- Exits `1` when the database is unreachable.
- Exits `1` when the schema is missing a column the repository uses.
- Repeatable — leftover rows from an aborted run don't break the next.
- Every `COPY` source in the Dockerfile exists in the build context.
- `npm ci` succeeds against the committed `package-lock.json`.
- Typechecks clean under `strict: true`.

**Not verified**: `docker compose build` / `run` themselves — no
container registry access in the environment this was developed in.
The test was run directly with container-style environment variables
and passes. Confirm the compose path on your machine.

## Next step

The datasource is done and proven. Step 3 is the service skeleton —
config, pool, `/healthz`, graceful shutdown — which will consume this
repository rather than talking to `pg` directly.
