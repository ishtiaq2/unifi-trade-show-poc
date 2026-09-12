# Clean Rebuild — Steps 1 Through 7

Tears everything down, rebuilds from nothing, verifies every layer
before moving to the next. Run top to bottom.

- [0. Full teardown](#0-full-teardown)
- [1. Shared network](#1-shared-network)
- [2. Database](#2-database)
- [3. Devices](#3-devices)
- [4. Monitoring service (REST + poller)](#4-monitoring-service-rest-poller)
- [5. Live end-to-end verification](#5-live-end-to-end-verification)
- [6. Automated test suites](#6-automated-test-suites)
- [7. Troubleshooting](#7-troubleshooting)

---

## 0. Full teardown

```bash
cd monitoring-service && podman-compose down
cd ../devices && podman-compose down
cd ../db && podman-compose down -v
```

**`-v` on `db` only, deliberately.** `devices` and `monitoring-service`
have no persistent state worth keeping — a plain `down` is enough.
`db` is different: Postgres only re-applies `init.sql` when its data
directory is **empty**. Without `-v` here, the container comes back up
with whatever schema it had before, silently ignoring any changes —
including the `reachable` column from the step 7 fix. This is the
single most common way to lose an hour re-running a "clean" rebuild
that wasn't actually clean.

Optional, for a genuinely from-nothing state:
```bash
podman container prune -f
podman image prune -f
podman rmi localhost/unifi-monitoring-rest localhost/unifi-devices
```

---

## 1. Shared network

```bash
podman network create unifi-net
podman network ls | grep unifi-net
```

If it already exists, `create` errors harmlessly — that's fine, `ls`
is the real check.

---

## 2. Database

```bash
cd db
podman-compose up -d
```

Wait for healthy, then verify the schema is actually correct — not
just "a container is running":

```bash
./postgres/verify.sh
```

Expect: **`13 passed, 0 failed`**

One more check specific to step 7 — `verify.sh` doesn't test the
`reachable` column directly, so confirm it by hand:

```bash
podman exec unifi-db psql -U poc -d poc -c "INSERT INTO devices (name, address) VALUES ('verify-x','verify-x:1');"
podman exec unifi-db psql -U poc -d poc -c "INSERT INTO diagnostics (device_id, reachable) SELECT id, true FROM devices WHERE address='verify-x:1';"
podman exec unifi-db psql -U poc -d poc -c "INSERT INTO diagnostics (device_id) SELECT id FROM devices WHERE address='verify-x:1';"
```
Expect an error on the second command: `null value in column "reachable" ... violates not-null constraint`.
That's correct — it proves the column exists and is enforced, not
silently accepting bad rows. Clean up the test row:
```bash
podman exec unifi-db psql -U poc -d poc -c "DELETE FROM devices WHERE address='verify-x:1';"
```

Confirm network membership (should be automatic if `db/docker-compose.yml`
has the per-service `networks:` block; check if unsure):
```bash
podman inspect unifi-db --format '{{.NetworkSettings.Networks}}'
```
Should show `unifi-net`. If it doesn't:
```bash
podman network connect unifi-net unifi-db
```

---

## 3. Devices

```bash
cd ../devices
podman-compose up -d --build
podman ps
```

Expect 6 containers: `router`, `switch`, `camera-rest`,
`door-access-rest`, `camera-grpc`, `door-access-grpc`.

Test the 4 REST devices (`-X` is uppercase; `-x` is curl's *proxy*
flag and fails immediately with an unrelated error):
```bash
curl http://localhost:4001/health
curl http://localhost:4002/health
curl http://localhost:4003/health
curl http://localhost:4004/health
```

**The 2 gRPC devices (4005, 4006) cannot be curled** — gRPC runs over
HTTP/2 with protobuf framing. Use the grpc client script instead:
```bash
npm run grpc-client -- localhost:4005
npm run grpc-client -- localhost:4006
```

Confirm network membership for all 6 (should be automatic if
`devices/docker-compose.yml` declares `networks: [unifi-net]` per
service):
```bash
for c in devices_router_1 devices_switch_1 devices_camera-rest_1 \
         devices_door-access-rest_1 devices_camera-grpc_1 devices_door-access-grpc_1; do
  echo -n "$c: "
  podman inspect "$c" --format '{{.NetworkSettings.Networks}}'
done
```
Every line should include `unifi-net`.

---

## 4. Monitoring service (REST + poller)

```bash
cd ../monitoring-service
podman-compose up -d --build
```

```bash
curl -s http://localhost:3000/healthz
```
Expect: `{"ok":true}`

Check the poller actually started (it's in-process with the REST
server, not a separate container — starts automatically):
```bash
podman logs monitoring-service_rest_1 --tail 20
```
Expect an early line: `{"level":"info","msg":"poller started","intervalMs":10000}`

---

## 5. Live end-to-end verification

Register all four REST devices:
```bash
curl -X POST http://localhost:3000/devices -H "Content-Type: application/json" \
  -d '{"name":"router-1","address":"router:4001"}'
curl -X POST http://localhost:3000/devices -H "Content-Type: application/json" \
  -d '{"name":"switch-1","address":"switch:4002"}'
curl -X POST http://localhost:3000/devices -H "Content-Type: application/json" \
  -d '{"name":"camera-rest-1","address":"camera-rest:4003"}'
curl -X POST http://localhost:3000/devices -H "Content-Type: application/json" \
  -d '{"name":"door-access-rest-1","address":"door-access-rest:4004"}'
```

Each response should show `"protocol":"rest"` with real `capabilities`
— confirms both step 5 (discovery) and the container network path work
together.

```bash
curl http://localhost:3000/devices
```
All four should show `"status":"reachable"`.

**Watch the poller work, live:**
```bash
podman logs -f monitoring-service_rest_1
```
Every ~10s (default `POLL_INTERVAL_MS`), you'll see a `[HEARTBEAT]`
line per device and structured `"device checked"` log entries. Leave
this running while you do the next check.

**Confirm deduplication — the step 7 fix — directly in the database:**
```bash
podman exec unifi-db psql -U poc -d poc -c \
  "SELECT d.name, count(*) FROM diagnostics dg
   JOIN devices d ON d.id = dg.device_id
   GROUP BY d.name;"
```
Run this once, wait 60+ seconds (6+ poll cycles), run it again. **The
counts should not have grown** for devices that stayed healthy the
whole time — one row per device, its `recorded_at` timestamp
advancing, not a new row every cycle. This is the exact behavior that
was broken before the fix (5 cycles used to produce 5 rows).

**Confirm outage preservation** (optional, more involved — stop a
device, wait for it to be marked down, restart it, confirm the outage
row survives):
```bash
podman stop devices_camera-rest_1
# wait ~40s for 3 consecutive failures (default threshold)
curl http://localhost:3000/devices | grep -A5 camera-rest   # status should be "down"
podman start devices_camera-rest_1
# wait one more poll cycle
podman exec unifi-db psql -U poc -d poc -c \
  "SELECT reachable, count(*) FROM diagnostics dg
   JOIN devices d ON d.id = dg.device_id
   WHERE d.name = 'camera-rest-1' GROUP BY reachable;"
```
Expect **two rows**: one `reachable=f` (the outage, permanently kept)
and one `reachable=t` (the recovery) — not zero, not one merged row.

---

## 6. Automated test suites

Containers running the live system are one form of proof; the
automated suites are the other — run both.

```bash
cd datasource-module
npm install
npm test
```
Expect: **`36 checks passed !!!`**

```bash
cd ../rest
npm install
export TEST_DATABASE_URL=postgres://poc:poc@localhost:5432/poc_test
# create the test database once if it doesn't exist:
#   podman exec unifi-db createdb -U poc poc_test
#   podman exec -i unifi-db psql -U poc -d poc_test < ../../db/postgres/init.sql
npm test
```
Expect: **`5 passed (5)` / `40 passed (40)`** across `api.test.ts`,
`discovery.test.ts`, `restDeviceClient.test.ts`, `stateMachine.spec.ts`,
and `poller.test.ts`.

---

## 7. Troubleshooting

**`curl: (7) Failed to connect` from another machine, but `localhost`
works on the VM itself** — firewall, not the app:
```bash
sudo firewall-cmd --add-port=3000/tcp --add-port=4001-4006/tcp --permanent
sudo firewall-cmd --reload
```

**`getaddrinfo ENOTFOUND router` (or similar) in the rest container's
logs** — a device isn't on `unifi-net`. Check with the `podman inspect`
commands in sections 2–3 above; reconnect with
`podman network connect unifi-net <container>` if needed. Note this
doesn't survive `down`/`up` unless the compose file itself declares
`networks:` per service — a manual `connect` is a one-time patch, not
a permanent fix.

**Schema looks unchanged after editing `init.sql`** — you skipped the
`-v` in step 0. `down -v` then `up` again.

**`curl -x GET ...` fails with "Could not resolve proxy"** — typo,
should be `-X` (uppercase). `-x` is curl's proxy flag. GET is also
curl's default method, so omitting `-X` entirely works too.

**Devices container fails to build with a TypeScript error mentioning
`ts-node`** — check `devices/package.json` has `"typescript": "^5.9.x"`
pinned, not a wide range like `^5.5.0` — an unpinned range can resolve
TypeScript 7, which crashes `ts-node`.
