# gRPC Device Simulators

Four simulated network devices that speak **gRPC**, standing in for real
hardware. They exist so a client can be built and demonstrated against
something genuinely real — real sockets, real protobuf framing, real
gRPC status codes — without physical devices on the bench.

This repo is **gRPC only**. No REST, no database, no monitoring service.
It has two runtime dependencies (`@grpc/grpc-js`, `@grpc/proto-loader`)
and nothing else.

- [Quick start](#quick-start)
- [The demo](#the-demo)
- [The devices](#the-devices)
- [The service contract](#the-service-contract)
- [Talking to a device yourself](#talking-to-a-device-yourself)
- [Containers](#containers)
- [How it's built](#how-its-built)
- [gRPC gotchas worth knowing](#grpc-gotchas-worth-knowing)

---

## Quick start

```bash
npm install
npm run devices     # starts all four, colour-coded, in one terminal
```

Then in a second terminal:

```bash
npm run demo
```

That's the whole thing. The demo walks through every behavior these
devices implement, making real RPCs against the running servers.

## The demo

`npm run demo` runs five steps. Every line it prints is an actual
response — or an actual gRPC error — from a live server, not a
simulated or pre-recorded result.

**1. A healthy device.** The two RPCs this service exposes:

```
  GetHealth      -> protocol=grpc  device=camera-grpc-1
                    capabilities=[diagnostics]
  GetDiagnostics -> hw=CAM-HW-2.0 sw=4.0.0 fw=FW-5.0.1
                    self-reported status = "ok"
```

**2. Reachable is not the same as healthy.** `door-access-grpc-1`
answers every RPC successfully while reporting a fault about itself:

```
    gRPC status      : OK  (every RPC succeeds)
    self-reported    : "degraded"
```

A client checking only for gRPC errors would call this device healthy.
Both signals have to be read — the status code *and* the payload.

**3. A failed RPC is not a failed device.** Twelve calls against the
flaky camera:

```
    ok  ok  ok  ERR ok  ok  ok  ok  ok  ok  ok  ok
```

The device was never broken — that's an unstable link. Concluding
"down" from the first `ERR` would be a false alarm.

**4. A device that genuinely dies.** Ten calls against the dying door
controller:

```
    ok  ok  ok  ok  ok  ok  ERR ERR ERR ERR
```

Healthy, then permanently failing, never recovering. Retrying helps in
step 3 and is futile here — which is exactly why retries need a bound
rather than running forever.

**5. Real gRPC error codes.** What a client actually receives:

```
  a) nothing listening on the port:
     code 14 (UNAVAILABLE)
  b) deadline too short to complete:
     code 4 (DEADLINE_EXCEEDED)
```

## The devices

| Device | Port | Behavior | What it demonstrates |
|---|---|---|---|
| `camera-grpc` | 4005 | always healthy | the control case |
| `door-access-grpc` | 4006 | healthy, but **self-reports `degraded`** | reachable ≠ healthy |
| `camera-grpc-flaky` | 4007 | **~30% of RPCs fail**, always recovers | transient failure — retry helps |
| `door-access-grpc-dying` | 4008 | healthy for 6 RPCs, then **permanently dead** | real failure — retry is futile |

Run one at a time instead of all four:

```bash
npm run camera-grpc
npm run door-access-grpc
npm run camera-grpc-flaky
npm run door-access-grpc-dying
```

Override a port without editing a profile:

```bash
PORT=9999 npm run camera-grpc
```

Note that `failureRate` is **per RPC**, not per health check. A client
calling `GetHealth` then `GetDiagnostics` makes two RPCs, so with a
0.3 rate the chance of at least one failing is `1 - 0.7² = 51%`, not
30%. Easy to get wrong when tuning these values.

## The service contract

`_shared/device.proto` — the whole contract:

```protobuf
service DeviceService {
  rpc GetHealth (HealthRequest) returns (HealthResponse);
  rpc GetDiagnostics (DiagnosticsRequest) returns (DiagnosticsResponse);
}

message HealthResponse {
  string protocol = 1;
  repeated string capabilities = 2;
  string deviceName = 3;
}

message DiagnosticsResponse {
  string hwVersion = 1;
  string swVersion = 2;
  string fwVersion = 3;
  string status = 4;
}
```

Both are **unary** RPCs — one request, one response. `GetHealth` is
capability discovery: a client calls it first to learn what the device
is and what it supports, before asking for anything else.

## Talking to a device yourself

**`curl` does not work.** gRPC runs over HTTP/2 with protobuf framing;
a plain HTTP client gets nothing usable, and neither does a browser.
Use the included client:

```bash
npm run client -- localhost:4005
```

```
health: { capabilities: [ 'diagnostics' ], protocol: 'grpc', deviceName: 'camera-grpc-1' }
diagnostics: { hwVersion: 'CAM-HW-2.0', swVersion: '4.0.0', fwVersion: 'FW-5.0.1', status: 'ok' }
```

Run it repeatedly against the flaky device to watch failures appear:

```bash
npm run client -- localhost:4007
```

[`grpcurl`](https://github.com/fullstorydev/grpcurl) works too, pointed
at the proto file:

```bash
grpcurl -plaintext -proto _shared/device.proto \
  localhost:4005 device.DeviceService/GetHealth
```

## Containers

```bash
docker compose up            # all four
docker compose up camera-grpc # just one
```

Works unchanged with `podman-compose up`. If `podman-compose` isn't
installed (Podman doesn't bundle it):

```bash
sudo dnf install podman-compose
# or: pip3 install --user podman-compose
```

Run the demo against containerised devices. From the host, ports are
published, so the normal command just works:

```bash
npm run demo
```

From *inside* a container (where devices are reachable by service name
rather than `localhost`), set `DEVICE_HOSTS=compose`:

```bash
docker compose exec camera-grpc env DEVICE_HOSTS=compose npm run demo
```

One image backs all four devices, built once and shared via a common
`image:` tag rather than four separate `build:` stanzas.

## How it's built

```
_shared/
├── device.proto          the wire contract
├── types.ts              DeviceProfile — config shape only, no logic
├── grpc-simulator.ts     the ONE server implementation
├── start-grpc.ts         bind, log, listen
└── test-grpc-client.ts   manual poking client

camera-grpc/              each device folder is just:
├── profile.ts              its config
└── index.ts                 3 lines calling startGrpcDevice(profile)
```

Every device folder supplies **only a profile**. Adding a fifth device
is a new folder with a profile and a three-line `index.ts` — no server
code is duplicated, so a bug fixed in `grpc-simulator.ts` is fixed
everywhere at once.

There is deliberately **no build step**. `tsconfig.json` sets
`noEmit: true` and everything runs through `ts-node`. An earlier
version of this code compiled with plain `tsc` and no `outDir`, which
emitted `.js` files next to their `.ts` sources — and Node resolves
`.js` before `.ts` for an extensionless `require()`, so after any edit
the *stale compiled copy* would run silently, with no error. `noEmit`
removes that trap entirely.

## gRPC gotchas worth knowing

**`keepCase` must match on both sides.** `@grpc/proto-loader`'s
`keepCase` option decides whether protobuf fields arrive in JavaScript
as written in the `.proto` or converted to camelCase. If a client and
server disagree, **the data still arrives correctly on the wire** — but
the client reads `undefined` from the field name it expects, with no
error and no crash. This repo pins `keepCase: false` in
`grpc-simulator.ts`; any client must do the same.

**A successful RPC says nothing about device health.** See device 2
above. The gRPC status code tells you the call completed; the payload
tells you what the device thinks of itself. They're independent.

**Deadlines are a client-side promise, not server cancellation.** A
call that exceeds its deadline fails with `DEADLINE_EXCEEDED` on the
client, but the server may still be working on it. Deadlines bound how
long *you* wait, not how long the server runs.

**Bind to `0.0.0.0`, not `localhost`, inside a container.** Binding to
`localhost` makes the server unreachable through published ports —
easy to do, confusing to debug. `start-grpc.ts` binds `0.0.0.0`
deliberately.
