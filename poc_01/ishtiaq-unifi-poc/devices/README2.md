# Mock Device Simulators

Six standalone simulators standing in for the trade-show hardware —
routers, switches, cameras, and door-access systems, over both REST and
gRPC. **These are test fixtures, not the graded deliverable** — the
monitoring service in `../monitoring-service/` is. They exist so the
service has something real to monitor and so anyone can reproduce a
demo without physical gear.

- [Devices](#devices)
- [REST API](#rest-api)
- [gRPC](#grpc)
- [Install the tools](#install-the-tools)
- [Run individually — plain npm](#run-individually-plain-npm)
- [Run individually — podman](#run-individually-podman)
- [Run as a group — podman-compose](#run-as-a-group-podman-compose)
- [Troubleshooting](#troubleshooting)

---

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
  facts (`../dev-and-troubleshoot` #8).

### Hierarchy

```
                       DeviceProfile
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
       createRestDevice()             createGrpcDevice()
              │                             │
   ┌──────────┼──────────┬─────────┐        ├─────────────┐
   ▼          ▼          ▼         ▼        ▼             ▼
 Router     Switch    Camera-   Door-     Camera-      Door-Access-
 :4001      :4002     REST      Access-   gRPC         gRPC
                       :4003    REST      :4005        :4006
                                :4004

     Fig 1. One shared implementation per protocol — every device
     folder supplies only a profile (identity, port, failure mode),
     never its own copy of server logic.
```

---

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
`{"error":"unavailable"}` response from it is expected behavior, not a
fault. `door-access-rest` answers normally for 8 requests, then returns
503 forever; restart the container to reset its counter for another
demo run.

## gRPC

gRPC devices **cannot be curled** — HTTP/2 with protobuf framing, not
plain HTTP. Browsers don't work either. Use the included client instead:

```bash
npm run grpc-client -- localhost:4005
```

```
health: { capabilities: [ 'diagnostics' ], protocol: 'grpc', deviceName: 'camera-grpc-1' }
diagnostics: { hwVersion: 'CAM-HW-2.0', swVersion: '4.0.0', fwVersion: 'FW-5.0.1', status: 'ok' }
```

`grpcurl` works too, pointed at `_shared/device.proto`.

---

## Install the tools

Skip whatever you already have.

**Node.js, via nvm** (needed either way — `npm ci` inside the container
build still needs a local `package-lock.json` to have been generated
once):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22
```

**podman-compose** (Podman itself does not bundle it — `podman compose`
with a space works only once one of these is on your `PATH`):

```bash
sudo dnf install podman-compose
```

If your distro's repos don't have it, or you're on an older release:

```bash
pip3 install --user podman-compose
```

If that reports an "externally managed environment" error:

```bash
pip3 install --user podman-compose --break-system-packages
```

Confirm it worked:

```bash
podman-compose --version
```

---

## Run individually — plain npm

No containers, fastest way to sanity-check one device:

```bash
cd devices
npm install

npm run router              # :4001
npm run switch               # :4002
npm run camera-rest           # :4003
npm run door-access-rest       # :4004
npm run camera-grpc             # :4005
npm run door-access-grpc         # :4006
```

Override a port without editing a profile:

```bash
PORT=9999 npm run camera-rest
```

## Run individually — podman

One image for all six; the run command selects which device starts.

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

Per-device curl and troubleshooting notes also live in each device's
own `docs/01-start-camera.md` — the filename is a leftover from
copy-pasting the template per device; the content inside is
device-specific.

**Container management:**

```bash
podman logs -f camera-rest              # watch one device live
podman stop camera-rest && podman rm camera-rest

# remove one device + rebuild the image from scratch
podman stop camera-rest ; podman rm camera-rest ; podman rmi unifi-devices ; podman image prune -a

# nuke everything podman knows about
podman rm -af ; podman rmi -af ; podman image prune -af
```

## Run as a group — podman-compose

Same six containers, one command, using `docker-compose.yml` in this
folder. Every service shares one `image: unifi-devices` tag rather than
each carrying its own `build:` — that guarantees the image is built
once and reused, not rebuilt six times with six separate (if identical)
tags.

```bash
cd devices
podman-compose build      # first time, or after any code change
podman-compose up -d      # all 6, backgrounded
```

```bash
podman-compose ps                    # what's running
podman-compose logs -f camera-rest    # one device's logs
podman-compose down                   # stop and remove all 6
```

Rebuild after a code change and bring everything back up in one step:

```bash
podman-compose up -d --build
```

Run just one device from the compose file:

```bash
podman-compose up -d router
```

---

## Troubleshooting

**`podman-compose: command not found`**
Not bundled with Podman — see [Install the tools](#install-the-tools).
`podman compose` (space) only works once `podman-compose` or
`docker-compose` is actually installed and on `PATH`; Podman is just
detecting and shelling out to it.

**`Error: creating build container: ... pinging container registry ...`**
No route to the registry — check your network/proxy, and confirm
`podman build` (not just `podman-compose`) can reach
`docker.io` directly:
```bash
podman pull node:22-slim
```

**`Error: ... address already in use` on `podman run` / `podman-compose up`**
A previous container is still holding the port — most often from mixing
individual `podman run` and `podman-compose` on the same ports.
```bash
podman ps -a               # find what's using it
podman stop <name> && podman rm <name>
```

**`Error: creating container storage: ... name "router" is already in use`**
A stopped-but-not-removed container from a previous run. `podman-compose
down` handles this cleanly; for a leftover from manual `podman run`:
```bash
podman rm router
```

**`curl: (7) Failed to connect ... No route to host`**, from another
machine on the network, not `localhost` itself — a host firewall
blocking the port, not a container problem:
```bash
sudo firewall-cmd --add-port=4001/tcp --permanent
sudo firewall-cmd --reload
```
(repeat per port, or open the whole 4001–4006 range at once with
`--add-port=4001-4006/tcp`)

**A gRPC device "doesn't respond" to curl**
Expected — see [gRPC](#grpc). Use `npm run grpc-client -- localhost:<port>`
or `grpcurl`, not `curl`.

**Code changes don't seem to take effect in a container**
The image is stale. `podman-compose up -d --build`, or for a manual
`podman run` setup, rebuild and recreate the specific container:
```bash
podman build --no-cache -t unifi-devices .
podman stop <name> && podman rm <name>
podman run -d --name <name> --network unifi-net -p <port>:<port> \
  unifi-devices npx ts-node <device>/index.ts
```

**`door-access-rest` stuck returning 503**
Working as designed — it dies permanently after 8 requests. Restart to
reset:
```bash
podman restart door-access-rest
# or: podman-compose restart door-access-rest
```

---

## Why there is no build step for TypeScript

`tsconfig.json` sets `noEmit: true`. Every device runs through
`ts-node` only — there is nothing to compile ahead of time. An earlier
configuration used plain `tsc` with no `outDir`, which emitted `.js`
files next to their `.ts` sources; after any source edit,
`node camera-rest/index.js` would silently run the **stale** compiled
copy instead of the current code. `noEmit` removes that trap entirely.
This is unrelated to the container build above — `podman build` /
`podman-compose build` package source files and `node_modules`, not
compiled output.
