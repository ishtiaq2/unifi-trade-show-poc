# gRPC Device Client — Step 8

A second implementation of the same `DeviceClient` interface built in
step 5, talking to the two gRPC device simulators (`camera-grpc`,
`door-access-grpc`) instead of the four REST ones.

```
src/clients/
├── DeviceClient.ts          the interface — unchanged by this step
├── RestDeviceClient.ts       step 5 — unchanged by this step
├── GrpcDeviceClient.ts        step 8 — this module
├── clientFactory.ts           now returns either, and falls back on discovery
└── proto/device.proto          the wire contract (see below)
```

## What step 8 actually changed

**One new file, plus small edits to two existing ones.** That's the
whole point of having defined `DeviceClient` back in step 5 rather
than calling `fetch` directly from the service layer:

| File | Change |
|---|---|
| `GrpcDeviceClient.ts` | new — the implementation |
| `clientFactory.ts` | `case "grpc"` now returns a client instead of throwing; `discoverProtocol` falls back REST → gRPC |
| `index.ts` | two lines: import and call `closeClients()` in shutdown |

**Nothing above the interface changed at all.** `MonitoringService`,
the poller, the HTTP layer, and the state machine are byte-identical
to before this step — verified by the fact that all 40 pre-existing
tests still pass untouched.

## The setting that would have failed silently

```typescript
const loaderOptions: protoLoader.Options = {
  keepCase: false,   // MUST match devices/_shared/grpc-simulator.ts
  ...
};
```

If this client and the server disagree on `keepCase`, **the data still
arrives correctly on the wire** — but field names don't match what the
reading side expects, so every field reads `undefined`. No error, no
exception, no crash. The symptom would be diagnostics quietly full of
nulls, indistinguishable from a device that reports nothing.

This is why `grpcDeviceClient.spec.ts` asserts on actual field
*values* (`hwVersion === "GH-1"`) rather than just `result.ok`. A test
that only checked `ok` would pass with every field undefined.

## Two copies of device.proto — a deliberate, noted trade-off

The contract lives at `devices/_shared/device.proto`, and there's a
verbatim copy at `src/clients/proto/device.proto`. Docker cannot
`COPY` from outside a build context, and `rest`'s context is
`monitoring-service/` — which doesn't contain `devices/`. A symlink
breaks in the image for the same reason.

Two copies of a contract is a real duplication risk: if the `.proto`
changes, both must change. The alternatives (a shared npm package, or
a build step that copies it in) are more machinery than a PoC with one
fixed contract warrants. Flagged here rather than left to be
discovered.

## Channel reuse and cleanup

gRPC channels are built once per address and cached — grpc-js channels
are designed to be long-lived and handle reconnection internally, so
building a new one per health check would add connection setup to
every poll cycle for no benefit.

The flip side: those channels hold event loop handles open, so
`closeClients()` is wired into `index.ts`'s shutdown. Without it the
process wouldn't exit cleanly on SIGTERM — the same class of bug as
the poller not being stopped, which was a real, verified problem in
step 7.

## Discovery: REST first, then gRPC

```typescript
try   { return { protocol: "rest", capabilities: await restClient.discoverCapabilities(address) }; }
catch { return { protocol: "grpc", capabilities: await grpcClient.discoverCapabilities(address) }; }
```

The order is arbitrary but not meaningless: REST is tried first only
because it's the cheaper failure — an HTTP request to a gRPC port
fails fast on a protocol mismatch, whereas the reverse can sit waiting
for the deadline.

A device that answers neither still throws, and both callers handle
that exactly as they did before this step existed:
`registerDevice` creates the device with `protocol: null`, and the
poller records a `reachable: false` reading and retries next cycle.

## Testing

```bash
cd monitoring-service/rest
npx vitest run test/grpcDeviceClient.spec.ts    # 8 tests, real gRPC devices
npm test                                         # full suite, 48 tests
```

8 new tests against **real gRPC device simulators** — real HTTP/2,
real protobuf framing, real gRPC status codes. Nothing mocked, for the
same reason `restDeviceClient.test.ts` isn't: a mock could confirm the
methods get called, but not catch a `keepCase` mismatch, which is the
failure that actually matters here.

## Verified

Run, not assumed:

- 8/8 new tests pass against real spawned gRPC devices.
- **48/48 total** — all 40 pre-existing tests still pass, no
  regressions from this step.
- Typechecks clean under `strict: true`.
- End-to-end against the live HTTP API: registering
  `localhost:4005` returns `"protocol":"grpc"` with real capabilities,
  and a REST device registered alongside it still resolves to
  `"rest"` — both protocols coexisting.
- The poller persists gRPC diagnostics correctly — confirmed directly
  in Postgres:
  ```
       name      | protocol | reachable | hw_version | device_reported_status
  ---------------+----------+-----------+------------+------------------------
   camera-grpc-1 | grpc     | t         | CAM-HW-2.0 | ok
   router-1      | rest     | t         | RTR-HW-2.1 | ok
  ```
  Real hardware versions from a real gRPC device, one row each
  (dedup working), indistinguishable at the storage layer from REST —
  exactly as the `DeviceClient` abstraction intends.

**Not verified**: `docker compose build` with the new dependency —
no container registry access in the development environment.
`@grpc/grpc-js` and `@grpc/proto-loader` are in `package.json` and
install cleanly; the Dockerfile's existing `COPY rest/src` already
picks up `src/clients/proto/device.proto` since it lives under `src/`.

## Next

Step 9: `ChecksumProvider` — the stub seam. The poller currently
hardcodes `checksum: null`; step 9 replaces that with an interface and
an honest stub implementation, ready for the real binary when it
exists.
