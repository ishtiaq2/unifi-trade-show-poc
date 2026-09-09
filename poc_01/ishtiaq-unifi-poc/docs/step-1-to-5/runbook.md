# Runbook — Bring-up, Testing, and Progress

Single source of truth. Replaces the two partially-overlapping drafts.

---

## Progress

| # | Step | Status |
|---|---|---|
| 1 | Devices | ✅ Done — all 6 running, verified |
| 2 | Postgres + schema | ✅ Done — `verify.sh` 13/13 |
| 3 | Service skeleton (config → pool → `/healthz` → shutdown) | ✅ Done |
| 4 | Repository + REST API | ✅ Done — 8 tests, real Postgres |
| 5 | DeviceClient (REST) | ✅ Done — 5 + 1 tests, real devices, wired into registration |
| 6 | State machine | Not built |
| 7 | Poller | Not built |
| 8 | gRPC client | Not built — the 2 gRPC devices are running but nothing calls them yet |
| 9 | ChecksumProvider | Not built |
| 10 | Life-cycle test | Not built |

See `architecture.svg` for the same information as a diagram — green
is done and verified, gray dashed is not built yet.

---

## ⚠ One thing to fix before your next build

Your `datasource-module` uses `data-source/` (hyphenated) as the actual
folder name:

```
datasource-module/data-source/sql-service.ts
datasource-module/data-source/__tests__/test-postgres.ts
```

If your `Dockerfile` still has:
```dockerfile
COPY datasource-module/datasource ./datasource-module/datasource
```
change it to match:
```dockerfile
COPY datasource-module/data-source ./datasource-module/data-source
```
and update the corresponding import in `rest/src/index.ts` and
`rest/src/service/monitoringService.ts`:
```ts
import { SQLService } from "../../datasource-module/data-source/sql-service";
```
A mismatch here fails the build with `ENOENT` / `Cannot find module`,
not silently — but better to fix it now than during your next
`podman-compose up --build`.

---

## 0. Prerequisites (once)

```bash
podman network create unifi-net
```

---

## 1. Devices

```bash
cd devices
podman-compose up -d
```

**Test the 4 REST devices** (note: `-X` uppercase; `-x` is curl's proxy
flag and fails immediately with "Could not resolve proxy"):

```bash
curl http://localhost:4001/health        # router
curl http://localhost:4002/health        # switch
curl http://localhost:4003/health        # camera-rest
curl http://localhost:4004/health        # door-access-rest
curl http://localhost:4001/diagnostics
```
`-X GET` is optional on all of these — GET is curl's default method.

**The 2 gRPC devices (4005, 4006) cannot be curled** — gRPC runs over
HTTP/2 with protobuf framing, which curl doesn't speak. Use the grpc
client script instead:
```bash
npm run grpc-client -- localhost:4005
npm run grpc-client -- localhost:4006
```

**Note on `__tests__/device-test.ts`**: not something I have a
verified record of building — confirm this file exists and what it
does before relying on it in a handoff doc. If it doesn't exist, the
commands above are the verified way to test the devices.

---

## 2. Database

```bash
cd ../db
podman-compose up -d
./postgres/verify.sh
```
Expect: `13 passed, 0 failed`

**Connect it to the shared network** (once — skip if already connected):
```bash
podman network ls | grep unifi-net              # confirm it exists
podman network connect unifi-net unifi-db
podman inspect unifi-db --format '{{.NetworkSettings.Networks}}'   # confirm it took
```

---

## 3. Monitoring service

```bash
cd ../monitoring-service
podman-compose up --build
```

```bash
curl -s http://localhost:3000/healthz
# {"ok":true}
```

---

## curl examples — REST API, full round trip

```bash
# Register — protocol resolves via real discovery against a running device
curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"router-1","address":"router:4001"}'
```
```json
{"id":"...","name":"router-1","address":"router:4001","protocol":"rest","capabilities":{...},"status":"reachable","consecutiveFailures":0,"lastCheckedAt":null,"lastSuccessAt":null}
```

```bash
# List everything
curl http://localhost:3000/devices

# One device (diagnostics is null until step 7's poller exists)
curl http://localhost:3000/devices/<id>

# Registering the same address again — rejected, not duplicated
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" -d '{"name":"dup","address":"router:4001"}'
# 409

# Remove it
curl -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3000/devices/<id>
# 204

# Confirm it's gone
curl http://localhost:3000/devices/<id>
# 404
```

Registering a device whose address **isn't** currently running still
succeeds, with `protocol` left `null`:
```bash
curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"not-running","address":"localhost:9999"}'
# 201, "protocol":null — not an error; see docs/assumptions.md
```

---

## Checking what's stored in the database

```bash
podman exec -it unifi-db psql -U poc -d poc
```

```sql
-- Everything, readable
SELECT name, address, protocol, status, consecutive_failures FROM devices;

-- One device, full row
SELECT * FROM devices WHERE name = 'router-1';

-- Raw capability-discovery response, as stored
SELECT name, capabilities FROM devices;

-- Diagnostics — empty until step 7's poller writes to it
SELECT d.name, dg.hw_version, dg.device_reported_status, dg.recorded_at
FROM diagnostics dg JOIN devices d ON d.id = dg.device_id
ORDER BY dg.recorded_at DESC;

-- Confirm a constraint fires, without going through the API
INSERT INTO devices (name, address) VALUES ('bad', 'router:4001');
-- ERROR: duplicate key value violates unique constraint "devices_address_key"
```
Exit with `\q`. Or non-interactively:
```bash
podman exec -it unifi-db psql -U poc -d poc -c "SELECT name, address, protocol, status FROM devices;"
```

---

## Running the automated tests

```bash
# datasource-module — 25 checks against real Postgres
cd datasource-module && npm install
npm test

# rest — 14 tests total, real Postgres + real spawned devices
cd ../rest && npm install
export TEST_DATABASE_URL=postgres://poc:poc@localhost:5432/poc_test
npm test
```

---

## Shutting down

```bash
cd monitoring-service && podman-compose down     # stops rest, leaves unifi-db running
cd ../devices && podman-compose down
cd ../db && podman-compose down                   # add -v to also wipe data
```
