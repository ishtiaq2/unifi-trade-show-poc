# monitoring-service — Step 4: Repository + REST API

The HTTP layer over `datasource-module`. Registers, lists, and removes
devices, tested against real Postgres. **No device discovery yet** —
that's step 5.

```
monitoring-service/
├── datasource-module/     step 2's module, unchanged in behavior
│   ├── datasource/sql-service.ts    (renamed from DeviceRepository)
│   └── domain/types.ts
├── rest/                   this step
│   ├── src/
│   │   ├── config/           env-driven config
│   │   ├── domain/logger.ts   structured JSON logging
│   │   ├── service/           MonitoringService — no discovery yet
│   │   ├── http/app.ts         Express routes + error mapping
│   │   └── index.ts             config → pool → listen → shutdown
│   ├── test/api.test.ts        8 tests, real Postgres
│   └── Dockerfile
└── docker-compose.yml      builds rest/, connects to unifi-db
```

## Two decisions worth explaining

**Why `datasource-module` isn't a container `rest` calls over the
network.** A REST API doesn't talk to its repository layer over HTTP or
gRPC — it calls it as a function, in the same process. Running them as
separate containers that pretend to be client/server would add a
network hop and a second point of failure for no reason. So `rest`'s
Docker build **copies `datasource-module`'s source into its own
image** and imports it directly (`import { SQLService } from
"../../datasource-module/datasource/sql-service"`). `datasource-module`
keeps its own container for running *its own test* in isolation — that
usage doesn't change.

**Why `protocol` is always `null` here.** The original draft for this
step pulled in `discoverProtocol` from a `DeviceClient` that doesn't
exist yet — that's step 5. Building it in now would make step 4
untestable without step 5 also being done, which breaks the "each step
independently testable" constraint the whole roadmap is built around.
So this step only does CRUD; `protocol` stays `null` until step 5 adds
the small, isolated change that starts filling it in.

## Why the build context is `monitoring-service/`, not `rest/`

Same reason as `datasource-module`: `rest/src/index.ts` imports
`../../datasource-module/...`, and Docker cannot `COPY` from outside
the build context. `docker-compose.yml` sets `context: .` from
`monitoring-service/` with `dockerfile: rest/Dockerfile`.

## Run it

Locally:

```bash
cd datasource-module && npm install && cd ../rest && npm install
export DATABASE_URL=postgres://poc:poc@localhost:5432/poc
npm run dev
```

Containerized, against your running `unifi-db`:

```bash
docker network create unifi-net              # once
# uncomment `networks:` in ../db/docker-compose.yml, restart unifi-db
cd monitoring-service
docker compose up --build
```

## Try it

```bash
curl localhost:3000/healthz

curl -X POST localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"router-1","address":"router:4001"}'
# {"id":"...","protocol":null,"status":"reachable", ...}

curl localhost:3000/devices
curl localhost:3000/devices/<id>

curl -X POST localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"dup","address":"router:4001"}'
# 409 — same address twice is rejected, not silently duplicated

curl -X DELETE localhost:3000/devices/<id>
# 204
```

## Test it

```bash
cd rest
export TEST_DATABASE_URL=postgres://poc:poc@localhost:5432/poc_test
npm test
```

8 tests against real Postgres — not mocked, for the same reason
`datasource-module`'s test isn't mocked: a mock can only confirm the
code calls the methods it expects, not catch a wrong status code or a
constraint that doesn't fire the way the handler assumes.

## Verified

Run, not assumed:

- Full API flow exercised with real `curl` against a real running
  service: register → list → get → duplicate rejected (409) → delete
  (204) → get again (404).
- 8/8 automated tests pass against real Postgres.
- Typechecks clean under `strict: true`, including the cross-module
  import from `datasource-module`.
- The exact container image layout was simulated locally — fresh
  `npm ci` in both modules, source laid out exactly as the Dockerfile's
  `COPY` instructions place it, run via the exact `CMD` — and the
  service booted and served real requests from that layout.
- Every `COPY` source in the Dockerfile confirmed to exist in the build
  context.

**Not verified**: `docker compose up --build` itself — no container
registry access in the environment this was developed in. The image's
actual contents and runtime behavior were verified by simulating the
layout directly; the `docker build` step itself needs confirming on
your machine.

## Next step

Step 5: `DeviceClient` — a real REST client talking to your four REST
device simulators, plus wiring `discoverProtocol` into
`registerDevice` so `protocol` stops being permanently `null`. This is
the step your original draft was reaching for; it's a small, isolated
addition to `MonitoringService` once `DeviceClient` exists on its own
and is independently tested against the running devices.
