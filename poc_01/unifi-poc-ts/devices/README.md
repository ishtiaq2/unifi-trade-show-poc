# Mock Device Simulators (TypeScript)

Six standalone simulators standing in for the trade-show hardware, since
none is available to develop against. They are **test fixtures, not the
graded deliverable** — the monitoring service is. They exist to make
"testing the whole thing must be easy" actually true.

| Device | Protocol | Port | Behavior |
|---|---|---|---|
| `router` | REST | 4001 | always healthy — the control case |
| `switch` | REST | 4002 | reachable, but **self-reports `degraded`** |
| `camera-rest` | REST | 4003 | **flaky** (~15%/request), always recovers |
| `door-access-rest` | REST | 4004 | healthy for 8 requests, then **permanently down** |
| `camera-grpc` | gRPC | 4005 | always healthy |
| `door-access-grpc` | gRPC | 4006 | always healthy |

Three distinct behaviors, each proving something different about the
monitoring service:

- **`camera-rest`** — an unstable link must produce `suspect` and recover,
  never a false `down` (the brief's explicit warning).
- **`door-access-rest`** — a genuinely dead device must still be detected.
  Without this, "never report down" would be trivially satisfiable by a
  service that never reports anything.
- **`switch`** — reachable while self-reporting a fault, proving derived
  reachability and device-reported status are independent facts
  (`docs/assumptions.md` #8).

## Running

```bash
npm install          # once — node_modules at devices/ root, shared by all 6

npm run router
npm run camera-rest
npm run camera-grpc
```

Override the port without editing a profile:

```bash
PORT=9999 npm run camera-rest
```

## Poking the APIs

REST devices work with curl or a browser:

```bash
curl http://localhost:4001/health
curl http://localhost:4001/diagnostics
```

gRPC devices **cannot** be curled (HTTP/2 + protobuf framing). Use:

```bash
npm run grpc-client -- localhost:4005
```

Expect `camera-rest` to return `{"error":"unavailable"}` roughly one
request in seven. That is the point of that device, not a fault.

## Why `failureRate` is 0.15 and not 0.35

The rate compounds. The monitoring service calls `/health` **and**
`/diagnostics` per check, each rolling independently, so the effective
check-failure probability is `1 - (1 - rate)²` — at 0.35 that is 58%, not
35%.

Simulated over a two-hour demo (720 poll cycles, 3 retries, threshold 3):

| `failureRate` | cycles in `suspect` | false `down` per 2h demo |
|---|---|---|
| 0.35 | 18.5% | **~5** |
| 0.20 | 4.6% | 0.1 |
| **0.15 (chosen)** | 2.1% | ~0 |

Five false alarms in front of customers is precisely what the brief warns
against. 0.15 keeps `suspect` visible while making a false `down`
effectively impossible.

A more physically faithful model would decide link state once per *check*
rather than per *request* — noted as a refinement, not implemented, since
a single tuned probability is sufficient for a fixture.

## Containers

```bash
podman network create unifi-net
podman build -t unifi-devices .

podman run -d --name camera-rest --network unifi-net -p 4003:4003 \
  unifi-devices npm run camera-rest
```

Notes:
- `.dockerignore` excludes `node_modules`, so `COPY . .` can't overwrite
  the image's install with the host's. Without it this works by luck
  until someone runs `npm install` locally, then breaks confusingly.
- The Dockerfile runs `npm ci` **including** devDependencies, because
  these run through `ts-node` — `ts-node` and `typescript` are genuinely
  runtime dependencies here. This differs deliberately from
  `monitoring-service`, which compiles ahead of time and ships
  production-only.
- Container-to-container addressing uses container names
  (`camera-rest:4003`), which only resolves on the shared network. From
  the host, use `localhost:<published-port>`.

## Why there is no build step

`tsconfig.json` sets `noEmit: true`. These run through `ts-node` only.

An earlier configuration ran plain `tsc` with no `outDir`, emitting `.js`
files next to their `.ts` sources. That created a real trap: after any
source edit, `node camera-rest/index.js` silently ran the **stale**
compiled copy — no error, just wrong behavior, which was confirmed by
reproducing it. `noEmit` removes the possibility entirely, and
`.dockerignore` excludes `**/*.js` defensively.

## Real bugs caught here

- **Module resolution across sibling folders.** An earlier layout kept
  `node_modules` inside `_shared/`, so gRPC entrypoints requiring
  `@grpc/grpc-js` directly failed with `MODULE_NOT_FOUND` — Node resolves
  from the requiring file's own directory, not from wherever the call
  originates. Fixed by hoisting dependencies to the `devices/` root, the
  common ancestor of all six.
- **The compounding failure rate**, above — found by simulating the
  interaction between the simulator and the monitoring service's retry
  logic, not by reading either one in isolation.
