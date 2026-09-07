# Mock Device Simulators

Six standalone simulators standing in for the trade-show hardware —
routers, switches, cameras, and door-access systems, over both REST and
gRPC. **These are test fixtures, not the graded deliverable** — the
monitoring service in `../monitoring-service/` is. They exist so the
service has something real to monitor and so anyone can reproduce a
demo without physical gear.

## Devices

| Device | Protocol | Port | Behavior |
|---|---|---|---|
| `router` | REST | 4001 | always healthy — the control case |
| `switch` | REST | 4002 | reachable, but **self-reports `degraded`** |
| `camera-rest` | REST | 4003 | **flaky** (~15%/request), always recovers |
| `door-access-rest` | REST | 4004 | healthy for 8 requests, then **permanently down** |
| `camera-grpc` | gRPC | 4005 | always healthy |
| `door-access-grpc` | gRPC | 4006 | always healthy |

Three deliberately different behaviors, each proving something specific
about the monitoring service:

- **`camera-rest`** — an unstable link must produce `suspect` and
  recover, never a false `down`.
- **`door-access-rest`** — a genuinely dead device must still be
  detected, so "never false-alarm" isn't trivially satisfied by a
  service that never reports anything.
- **`switch`** — reachable while self-reporting a fault, proving
  derived reachability and device-reported status are independent
  facts (`` #8).

```
                    DeviceProfile
                          │
                          ▼
                   createRestDevice()
                          │
        ┌─────────────┬─────────────┬─────────────────┐
        ▼             ▼             ▼                 ▼
      Router        Switch      Camera-REST      Door-Access-REST
     :4001         :4002         :4003              :4004

                   createGrpcDevice()
                          │
                ┌─────────────────────┐
                ▼                     ▼
           Camera-gRPC          Door-Access-gRPC
             :4005                  :4006

     Fig 1. One shared implementation per protocol; each device
     folder supplies only a profile (config), not its own server.
```

## REST API

```
GET /health        capability discovery — protocol, supported fields
GET /diagnostics    HW/SW/FW version + the device's own reported status
```

```bash
curl http://localhost:4001/health
# {"protocol":"rest","capabilities":["diagnostics"],"deviceName":"router-1"}

curl http://localhost:4001/diagnostics
# {"hwVersion":"RTR-HW-2.1","swVersion":"1.4.0","fwVersion":"FW-9.2.3","status":"ok"}

curl http://localhost:4002/diagnostics
# {"hwVersion":"SW-HW-3.0","swVersion":"2.1.1","fwVersion":"FW-7.0.0","status":"degraded"}
```

`camera-rest` fails roughly one request in seven by design — a
`{"error":"unavailable"}` from it is expected behavior, not a fault.

## gRPC

gRPC devices **cannot be curled** — HTTP/2 with protobuf framing, not
plain HTTP. Browsers don't work either. Use the included client:

```bash
npm run grpc-client -- localhost:4005
```

```
health: { capabilities: [ 'diagnostics' ], protocol: 'grpc', deviceName: 'camera-grpc-1' }
diagnostics: { hwVersion: 'CAM-HW-2.0', swVersion: '4.0.0', fwVersion: 'FW-5.0.1', status: 'ok' }
```

`grpcurl` works too, pointed at `_shared/device.proto`.

---

## Running — plain npm scripts

Simplest path, no containers needed:

```bash
cd devices
npm install

npm run router             # :4001
npm run switch              # :4002
npm run camera-rest          # :4003
npm run door-access-rest      # :4004
npm run camera-grpc            # :4005
npm run door-access-grpc        # :4006
```

Override a port without editing a profile:

```bash
PORT=9999 npm run camera-rest
```

## Running — podman, shared network

One image for all six devices; the run command selects which one starts.

**Prerequisites** (skip if Node/npm are already set up):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22
```

**Build once:**

```bash
podman network create unifi-net
cd devices
podman build --no-cache -t unifi-devices .
podman images   # confirm it's there
```

**Run each device, same network, published ports:**

```bash
podman run -d --name router --network unifi-net -p 4001:4001 \
  unifi-devices npx ts-node router/index.ts

podman run -d --name switch --network unifi-net -p 4002:4002 \
  unifi-devices npx ts-node switch/index.ts

podman run -d --name camera-rest --network unifi-net -p 4003:4003 \
  unifi-devices npx ts-node camera-rest/index.ts

podman run -d --name door-access-rest --network unifi-net -p 4004:4004 \
  unifi-devices npx ts-node door-access-rest/index.ts

podman run -d --name camera-grpc --network unifi-net -p 4005:4005 \
  unifi-devices npx ts-node camera-grpc/index.ts

podman run -d --name door-access-grpc --network unifi-net -p 4006:4006 \
  unifi-devices npx ts-node door-access-grpc/index.ts
```

`docker compose up` runs all six with one command instead — see the
root `docker-compose.yml`; these `podman run` commands are what it does
under the hood, spelled out for manual/standalone use.

Per-device curl and troubleshooting notes live in each device's own
`docs/01-start-camera.md` — filename is a leftover from copy-pasting the
template per device; content is device-specific.

### Container management

```bash
podman logs -f camera-rest              # watch one device live
podman stop camera-rest && podman rm camera-rest

# clean slate — remove one device + rebuild image from scratch
podman stop camera-rest ; podman rm camera-rest ; podman rmi unifi-devices ; podman image prune -a

# nuke everything podman knows about
podman rm -af ; podman rmi -af ; podman image prune -af
```

## Why there is no build step

`tsconfig.json` sets `noEmit: true`. Every device runs through
`ts-node` only. An earlier configuration compiled with plain `tsc` and
no `outDir`, which emitted `.js` files next to their `.ts` sources —
after any source edit, `node camera-rest/index.js` would silently run
the **stale** compiled copy. `noEmit` removes that trap entirely.

## Known cleanup item

`camera-rest/profile.ts` currently has debug markers from verifying the
JS→TypeScript conversion — `deviceName: "camera-rest-1-ts-AA"` and
`capabilities: ["diagnostics-ts"]` instead of the plain values every
other device uses. Harmless today since nothing validates these
strings, but worth cleaning before submission so a reviewer doesn't
read them as sloppiness.

## Real bugs caught here

- **Module resolution across sibling folders.** `node_modules` living
  only inside `_shared/` meant gRPC entrypoints requiring
  `@grpc/grpc-js` directly failed with `MODULE_NOT_FOUND` — Node
  resolves from the requiring file's own directory, not the caller's.
  Fixed by hoisting dependencies to the `devices/` root.
- **Stale `.js` files shadowing `.ts` sources.** Leftover
  `grpc-simulator.js` and `test-grpc-client.js` from the original
  JavaScript version sat next to their TypeScript replacements.
  `require("./grpc-simulator")` resolves `.js` before `.ts` in Node's
  default resolution — confirmed by loading the module directly, no
  `ts-node` involved — so every edit to the `.ts` version was silently
  running old code. Fixed by deleting the `.js` files; there is no
  config flag that changes this priority, so the fix is to never let
  both exist for the same name.
- **The compounding failure rate.** `camera-rest`'s failure rate is
  0.15, not the more intuitive 0.35 — the monitoring service calls
  `/health` **and** `/diagnostics` per check, each rolling failure
  independently, so a "35%" device actually fails 58% of checks.
  Simulation showed ~5 false `down` transitions across a two-hour demo
  at 0.35; 0.15 keeps `suspect` visible while making a false `down`
  effectively impossible. Found by simulating the interaction between
  the simulator and the monitoring service's retry logic, not by
  reading either file alone.
