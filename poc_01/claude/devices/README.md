# Mock Device Simulators

Six lightweight simulators standing in for real trade-show hardware,
since none is available to develop against. All share two implementations
in `_shared/` — one per folder would mean six copies of the same server
logic to keep in sync.

| Folder | Protocol | Port | Behavior |
|---|---|---|---|
| `router` | REST | 4001 | always healthy |
| `switch` | REST | 4002 | reachable, but **self-reports `degraded`** |
| `camera-rest` | REST | 4003 | **flaky** — ~35% failure rate, always recovers |
| `door-access-rest` | REST | 4004 | healthy for 8 requests, then **permanently down** |
| `camera-grpc` | gRPC | 4005 | always healthy |
| `door-access-grpc` | gRPC | 4006 | always healthy |

`switch` demonstrates a third, different case: a device that answers
every request perfectly while reporting a fault about *itself*. This is
why device-reported status is stored separately from derived
reachability (docs/assumptions.md #8) — collapsing them would lose this.

`camera-rest` and `door-access-rest` exist specifically to demo the two
different failure behaviors the monitoring service needs to tell apart:
an unstable-but-fine device (should never be reported "down") versus an
actually-dead device (should be reported "down" after real, sustained
failure — see `docs/assumptions.md` #4 for the state-machine reasoning).

## Running one directly

```bash
cd devices && npm install
node router/index.js               # REST, port 4001
node camera-grpc/index.js          # gRPC, port 4005
```

Test a REST device: `curl http://localhost:4001/health`
Test a gRPC device: `node _shared/test-grpc-client.js localhost:4005`

## A real bug this surfaced

The original `camera-grpc/index.js` / `door-access-grpc/index.js`
required `@grpc/grpc-js` directly for `ServerCredentials`, while the
package was only installed under `_shared/node_modules`. Node's module
resolution walks up from the *requiring file's own directory*, not from
whatever file ultimately calls into it — so this failed with
`MODULE_NOT_FOUND` the moment it was actually run, despite looking
correct on inspection (`grpc-simulator.js` itself resolved fine, since
its own `require`s live next to `_shared/node_modules`).

**Fix:** moved the shared `package.json`/`node_modules` up to `devices/`
(the common ancestor of every device folder), so every sibling folder's
`require`s resolve the same way. This is exactly the kind of bug that
only shows up by actually running the code per device folder, not by
reading it — each individual file looked fine in isolation.

## Docker

`../docker-compose.yml` builds all 6 from one `Dockerfile` (image built
once, `command` selects which simulator runs). **Not verified in this
environment** — no Docker available here — so confirm the build works on
your machine before relying on it for the trade-show demo itself.
