# User Manual

This is for someone **running and operating** the system — starting it,
registering devices, reading status, and knowing what to do when
something looks wrong. If you're trying to understand *how it's built*
rather than *how to use it*, see [`architecture.md`](architecture.md)
and [`specification.md`](specification.md) instead.

- [Starting the system](#starting-the-system)
- [Registering a device](#registering-a-device)
- [Checking status](#checking-status)
- [Reading the three states](#reading-the-three-states)
- [Removing a device](#removing-a-device)
- [Reading the logs](#reading-the-logs)
- [Tuning for a difficult venue network](#tuning-for-a-difficult-venue-network)
- [Troubleshooting](#troubleshooting)
- [Quick reference](#quick-reference)

---

## Starting the system

```bash
docker compose up
```

(or `podman-compose up` — both work unchanged)

This starts, in order: the database, then the monitoring service once
the database reports healthy, then the six simulated devices. Give it
about 10 seconds on first run — the database needs a moment to apply
its schema before the monitoring service will connect.

Confirm it's up:

```bash
curl localhost:3000/healthz
# {"ok":true}
```

If that doesn't return within a few seconds, see
[Troubleshooting](#troubleshooting).

## Registering a device

The device list is empty on first start — nothing is monitored until
you register it. Register all six simulated devices at once:

```bash
cd monitoring-service
DEVICE_HOSTS=compose npm run seed
```

```
router-1: registered, protocol=rest
switch-1: registered, protocol=rest
camera-rest-1: registered, protocol=rest
door-access-rest-1: registered, protocol=rest
camera-grpc-1: registered, protocol=grpc
door-access-grpc-1: registered, protocol=grpc
```

Or register one device by hand — this is the same request the seed
script makes, useful when a new device shows up on-site that wasn't
part of the original list:

```bash
curl -X POST localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name": "new-camera", "address": "192.168.1.50:8080"}'
```

The response includes `"protocol"`. If it's `null` rather than `"rest"`
or `"grpc"`, the device didn't answer during registration — this is not
an error, see [Reading the three states](#reading-the-three-states).
It'll resolve itself automatically once the device comes online, no
action needed.

**A device is identified by its address.** Registering the same address
twice returns `409 Conflict` rather than creating a duplicate — this is
deliberate, so a device never accidentally shows up twice on the status
screen.

## Checking status

Every device, current state:

```bash
curl localhost:3000/devices
```

```json
[
  {
    "id": "5b2464ea-...",
    "name": "router-1",
    "address": "router:4001",
    "protocol": "rest",
    "status": "reachable",
    "consecutiveFailures": 0,
    "lastCheckedAt": "2026-09-07T16:20:11.000Z",
    "lastSuccessAt": "2026-09-07T16:20:11.000Z"
  }
]
```

One device, with its latest diagnostics:

```bash
curl localhost:3000/devices/5b2464ea-...
```

```json
{
  "device": { "...": "as above" },
  "diagnostics": {
    "hwVersion": "SW-HW-3.0",
    "swVersion": "2.1.1",
    "fwVersion": "FW-7.0.0",
    "deviceReportedStatus": "degraded",
    "checksum": null,
    "recordedAt": "2026-09-07T16:20:11.000Z"
  }
}
```

**`status` and `deviceReportedStatus` are not the same field, on
purpose.** `status` (top level) is whether *this service* can reach the
device. `deviceReportedStatus` (inside `diagnostics`) is what the
*device itself* claims about its own health. A device can be
`"status": "reachable"` while `"deviceReportedStatus": "degraded"` —
that's not a bug, it's a switch telling you it has an internal fault
while still answering every request correctly. See
`architecture.md` → [Data model](architecture.md#data-model) for why
these are deliberately separate.

## Reading the three states

| `status` | What it means | What to do |
|---|---|---|
| `reachable` | Last check succeeded | Nothing |
| `suspect` | Recent failures, but under the threshold | Usually nothing — this is the system working correctly on a flaky link, not a fault. Watch it; if it doesn't clear within a few cycles, treat as `down` |
| `down` | Failures exceeded the threshold | Check the device physically — power, cabling, network. This is a real, sustained problem, not a blip |

A device briefly showing `suspect` and clearing on its own is expected
and correct — it's the direct result of the system refusing to raise a
false alarm over an unstable link. **Don't chase `suspect` states that
self-resolve.**

`protocol: null` on a freshly-registered device is not an error either
— it means capability discovery hasn't succeeded yet (the device may
still be booting). It resolves automatically on the next poll cycle
once the device answers.

## Removing a device

```bash
curl -X DELETE localhost:3000/devices/5b2464ea-...
```

Returns `204` on success, `404` if that ID doesn't exist. Removing a
device also removes its diagnostics history (cascading delete) — there
is no undo.

## Reading the logs

```bash
docker compose logs -f monitoring-service
```

Logs are structured JSON, one line per **state transition** — not one
line per check. A device that's been fine for an hour produces no log
output during that hour; only the moments its status actually changes
appear:

```json
{"ts":"...","level":"warn","msg":"device status changed","deviceId":"...","deviceName":"camera-rest-1","from":"reachable","to":"suspect","consecutiveFailures":1}
{"ts":"...","level":"error","msg":"device status changed","deviceId":"...","deviceName":"door-access-rest-1","from":"suspect","to":"down","consecutiveFailures":3}
```

`to: "down"` logs at `error`, `to: "suspect"` logs at `warn`, recovery
logs at `info` — filter by level if you only want to watch for real
problems:

```bash
docker compose logs -f monitoring-service | grep '"level":"error"'
```

## Tuning for a difficult venue network

Two environment variables control the false-alarm behavior, set on the
`monitoring-service` entry in `docker-compose.yml`:

| Variable | Default | Effect of raising it |
|---|---|---|
| `FAILURE_THRESHOLD` | `3` | More tolerance before a device is declared `down` — fewer false alarms, slower to notice a real outage |
| `POLL_INTERVAL_MS` | `5000` (compose) | Less network chatter per device — slower to notice any change either direction |

If the venue's network turns out to be worse than expected, raise
`FAILURE_THRESHOLD` (e.g. to `5`) and restart:

```bash
docker compose up -d --build monitoring-service
```

There's no need to touch device profiles or code for this — it's
exactly the kind of on-site adjustment these were made environment
variables for.

## Troubleshooting

**`curl: (7) Failed to connect` to `localhost:3000`**
The service isn't up yet, or didn't start. Check:
```bash
docker compose ps
docker compose logs monitoring-service
```
Most common cause: the database wasn't ready in time. `depends_on:
condition: service_healthy` should prevent this, but if it still
happens, `docker compose restart monitoring-service`.

**A device shows `protocol: null` and never resolves**
Confirm the device container is actually running and the monitoring
service can reach it — from another container on the same network
(not from your host):
```bash
docker compose exec monitoring-service wget -qO- http://camera-rest:4003/health
```
If that fails, the device itself is the problem — check
`docker compose logs camera-rest` (or whichever device).

**Every device shows `down` immediately after startup**
Likely registered before the device containers were fully up. Wait a
few seconds and check again — `suspect`/`down` states are not
permanent, a device recovers automatically the moment it starts
answering.

**Seed script says `already registered, skipping` but `/devices` is
empty**
The seed script and your `curl` are pointed at different databases —
check `DATABASE_URL` matches what `docker-compose.yml` set for
`monitoring-service`, and that you're not accidentally running against
a leftover local Postgres on the same port.

**Checksums are always `null`**
Expected, not a bug — the external checksum binary isn't available yet.
See `docs/assumptions.md` #3.

## Quick reference

```bash
# start everything
docker compose up

# register all 6 simulated devices
cd monitoring-service && DEVICE_HOSTS=compose npm run seed

# see everything
curl localhost:3000/devices

# see one device + its diagnostics
curl localhost:3000/devices/<id>

# register a device by hand
curl -X POST localhost:3000/devices -H "Content-Type: application/json" \
  -d '{"name": "...", "address": "host:port"}'

# stop monitoring a device
curl -X DELETE localhost:3000/devices/<id>

# watch only real problems
docker compose logs -f monitoring-service | grep '"level":"error"'

# stop everything
docker compose down
```
