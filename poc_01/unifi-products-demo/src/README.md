# UniFi Device Monitoring Fleet – Proof of Concept

This Proof of Concept (PoC) demonstrates a highly resilient, multi-protocol microservices architecture designed to discover, register, and monitor network hardware in real-time. It serves as both a development blueprint and an interactive trade show demonstration.

## Core Capabilities

1. **Multi-Protocol Discovery:** Seamlessly registers and communicates with both legacy REST devices and modern gRPC hardware.
2. **Smart Database Deduplication:** The background poller actively monitors device health but only writes a new database row when a device's state actually changes, optimizing storage.
3. **State Machine Resilience:** Automatically detects flaky devices, transitioning them through `reachable` → `suspect` → `down` without triggering false offline alarms.
4. **Isolated Sandboxing:** A zero-interference testing architecture allows rigorous integration testing via a dedicated test database without corrupting live production data.

---

## 🚀 Quick Start: Live Trade Show Demo

This single execution script spins up the entire architecture, boots 6 hardware simulators, registers them to the API, and mathematically verifies the background poller's deduplication engine in real-time.

```bash
cd unifi-products-demo/src
./test-final-demo.sh

```

**Live Monitoring:**
To show the raw data streams and poller heartbeats while the main demo is running, open a separate terminal and tail the API logs:

```bash
podman logs -f monitoring-service_rest_1

```

---

## 🔬 Automated Testing & CI/CD Validation

The repository includes multiple levels of automated verification.

### The Engineering Sandbox (Unit & Integration)

Spins down live containers, provisions an isolated `poc_test` database, and executes 71 tests simulating network timeouts, dead devices, and process lifecycle events.

```bash
cd unifi-products-demo/src/monitoring-service
./test-vitest-suite.sh

```

### Component-Level Verification Scripts

Targeted scripts to validate specific architectural layers in isolation:

* **Database & Data Access Layer (SQL Service):**
  `./test-devices-db-and-data_access_layer.sh`
* **HTTP API Layer End-to-End:**
  `http/__test__/test-api-layer.sh`

---

## 🛠️ Architecture & Data Flow

**Request Flow:**
`cURL Client` → `Express HTTP API` → `Monitoring Service` → `Data Access Layer` → `PostgreSQL`

| Component | Technology | Path | Port |
| --- | --- | --- | --- |
| **Database** | PostgreSQL 16 | `src/db` | `5432` |
| **Monitoring API** | Node.js / Express | `src/monitoring-service` | `3000` |
| **REST Simulators** | Express (Router, Switch, etc.) | `src/devices/01-rest` | `4001 - 4004` |
| **gRPC Simulators** | gRPC-js (Camera, Door Access) | `src/devices/02-grpc` | `4005 - 4006` |

---

## 💻 Manual Local Development Workflow

To operate the system manually step-by-step for development or deep-dive demonstrations:

**1. Start the Database**

```bash
cd unifi-products-demo/src/db
podman-compose down -v && podman-compose up -d

```

**2. Start the Hardware Simulators**

```bash
cd ../devices
./clean-slate-devices.sh

```

**3. Start the Monitoring API**

```bash
cd ../monitoring-service
podman-compose down && podman-compose up -d --build

```

**4. Verify System Health**

```bash
curl http://localhost:3000/healthz
# Expected: {"ok":true}

```

### API Interaction Examples

**Register a REST Router:**

```bash
curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"router-1","address":"router:4001"}'

```

**Register a gRPC Camera:**

```bash
curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"camera-grpc-1","address":"camera-grpc:4005"}'

```

**View All Registered Devices:**

```bash
curl http://localhost:3000/devices

```

**View Deep Diagnostics for a Specific Device:**

```bash
curl http://localhost:3000/devices/<UUID_HERE>

```

**Remove a Device:**

```bash
curl -i -X DELETE http://localhost:3000/devices/<UUID_HERE>
# Expected: HTTP/1.1 204 No Content

```


## How to show a failure during the trade show:
#### Deliberate Fault Injection & Recovery (Live State Machine Demo)
cd unifi-products-demo/src/devices
podman-compose stop camera-rest
podman-compose start camera-rest


### The Ultimate Trade Show "Mic Drop" Demo
1. Start the Fleet: Let the system run for a minute so the background poller does 5 or 6 cycles.

2. Show the Lean Database: Run ./check-dedup.sh. Point out that even though the poller has fired dozens of times, there are only exactly as many diagnostic rows as there are devices (e.g., 6 devices = 6 rows).

3. Simulate an Outage: Kill a device by running:
podman-compose -f devices/docker-compose.yml stop camera-rest

4. Watch the State Machine: Look at the live logs and watch it transition to suspect and then down.

5. Prove the Write: Run ./check-dedup.sh again. The audience will see the Diagnostic Rows count go up by exactly 1.


# Show extra features:
## 0: Using script: 
## 1. The "Protocol Agnostic" Hybrid Query
API seamlessly unifies both REST and gRPC devices under a single normalized interface.

## 2. Deep Device Inspection (Hardware & Software Signatures)
### Grab the first device ID dynamically and fetch its full diagnostics
DEV_ID=$(curl -s http://localhost:3000/devices | jq -r '.[0].id')
curl -s http://localhost:3000/devices/$DEV_ID | jq .

## 3. Input Validation & Edge Case Handling
Attempt to register an invalid payload (missing required address field)
curl -i -X POST http://localhost:3000/devices \
-H "Content-Type: application/json" \
-d '{"name":"invalid-device"}'


## 4. Warn: Device discovery pending: 
curl -X POST http://localhost:3000/devices -H 'Content-Type: application/json' -d '{"name":"door-grpc-1","address":"door-grpc:4006"}'
where door-grpc-1 does not exist.
#### Remove invalid registration
curl -X DELETE http://localhost:3000/devices/<UUID_OF_DOOR_GRPC>


## 5. Door Access Rest will go down permanently after 8 attempts:
1. Show dedup by running cd src && ./_03_check-dedup.sh
2. Reset: podman restart devices_door-access-rest_1
3. Check again: ./_03_check-dedup.sh
