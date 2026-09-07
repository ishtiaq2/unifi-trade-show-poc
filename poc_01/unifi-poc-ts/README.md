# Device Monitoring Service — Trade Show PoC

A Node.js/TypeScript service that monitors network devices over REST and
gRPC, stores their identity, status and diagnostics in Postgres, and
exposes an API for the latest state of every device.

Built in response to the "URGENT: PoC Needed for Trade Show" brief.

---

## Reviewers start here

| Document | What it is |
|---|---|
| **[`REPLY_TO_BOSS.md`](REPLY_TO_BOSS.md)** | The short reply, written as it would actually be sent |
| **[`AI_USAGE.md`](AI_USAGE.md)** | Where and why AI assistance was used, and the bugs human verification caught |
| [`docs/requirements.md`](docs/requirements.md) | Stated vs. implied requirements, prioritised, each mapped to where it is satisfied |
| [`docs/assumptions.md`](docs/assumptions.md) | Every ambiguous line in the brief, the interpretation chosen, and why |
| [`docs/specification.md`](docs/specification.md) | Architecture, state machine, data model, API, reliability |
| [`docs/non-goals.md`](docs/non-goals.md) | What was deliberately left out, and the reasoning |

---

## Run it

```bash
docker compose up
```

Starts Postgres (schema applied automatically), the monitoring service,
and six simulated devices. Then register the devices and look at them:

```bash
cd monitoring-service
DEVICE_HOSTS=compose npm run seed

curl localhost:3000/devices
```

Works the same with `podman-compose up`.

<details>
<summary>Running without containers</summary>

```bash
# 1. Database
createdb poc && psql -d poc -f db/init.sql

# 2. Devices (each in its own terminal, or backgrounded)
cd devices && npm install
npm run router          # :4001
npm run switch          # :4002
npm run camera-rest     # :4003
npm run door-access-rest # :4004
npm run camera-grpc     # :4005
npm run door-access-grpc # :4006

# 3. Service
cd monitoring-service && npm install
export DATABASE_URL=postgres://poc:poc@localhost:5432/poc
npm run dev

# 4. Register the devices through the real API
npm run seed
```
</details>

## Test it

```bash
cd monitoring-service
npm test
```

26 tests across four layers — pure logic, HTTP against real Postgres,
integration against real running device simulators over real sockets, and
a life-cycle suite that boots the actual entrypoint as a subprocess and
shuts it down through the real SIGTERM handler. Nothing about the
transport or database layers is mocked.

The life-cycle suite requires a reachable Postgres:

```bash
export TEST_DATABASE_URL=postgres://poc:poc@localhost:5432/poc_test
```

## Layout

```
monitoring-service/   the deliverable — Node.js/TypeScript service
├── src/domain/       pure logic: state machine, backoff, logger
├── src/clients/      DeviceClient interface + REST and gRPC implementations
├── src/checksum/     ChecksumProvider interface + stub (binary not yet available)
├── src/repo/         Postgres access
├── src/service/      orchestration
├── src/poller/       scheduled checks, retries, state transitions
├── src/http/         Express API
└── test/             4 suites, 26 tests

devices/              6 simulators standing in for trade show hardware
db/init.sql           schema
docs/                 requirements, assumptions, specification, non-goals
docker-compose.yml    the whole thing, one command
```

## The core behaviour, in one paragraph

A device is never marked down on a single failed check. Failures
accumulate through `suspect` and only reach `down` after a configurable
threshold, with bounded jittered retries inside each check cycle. Any
single success restores `reachable` immediately. That asymmetry is
deliberate: falsely showing a healthy device as down in front of a
customer costs far more than briefly showing a recovered one as suspect.
Reasoning in [`docs/assumptions.md`](docs/assumptions.md) #4.

## Known gaps

Stated here rather than left to be discovered:

- **The container build has not been executed** — no registry access in
  the development environment. The compiled build it runs was verified
  directly, but confirm `docker compose up` before relying on it.
- **gRPC is verified against simulators only** — no gRPC hardware exists
  in this scenario (`docs/assumptions.md` #2).
- **Checksums are `null`** until the external binary arrives — the
  integration seam is built and tested; deliberately not faked
  (`docs/assumptions.md` #3).
- **No authentication** — internal demo tool, see
  [`docs/non-goals.md`](docs/non-goals.md).
