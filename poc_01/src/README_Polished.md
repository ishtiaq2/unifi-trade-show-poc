# UniFi Device Monitoring Fleet – Proof of Concept

This Proof of Concept (PoC) demonstrates a highly resilient, multi-protocol microservices architecture designed to discover, register, and monitor network hardware in real time. It serves as both a development blueprint and an interactive trade show presentation.

---

## 📍 Quick Navigation

- [🚀 QUICK START TRADE SHOW](#-quick-start-trade-show-demo)
- [💻 Development Environment](#-development-environment)
- [🔬 Automated Testing & CI/CD](#-automated-testing--cicd-validation)
- [🛠️ Architecture & Data Flow](#️-architecture--data-flow)
- [🎭 Live Trade Show Demo Guide](#-live-trade-show-demo-guide)
- [🤖 Auto-Register Devices](#-auto-register-devices)
- [💻 Manual Local Development Workflow](#-manual-local-development-workflow)

---

## 💻 Development Environment

1. **Virtualization:** Oracle VM VirtualBox
2. **Operating System:** CentOS Stream 9

### How to Find OS Details

Verify operating system details and kernel versions using these terminal commands:

```bash
# View OS release details
cat /etc/os-release

# View host system, kernel, and architecture summary
hostnamectl

# View Linux kernel version and hardware architecture
uname -a

```

---

## Core Capabilities

1. **Multi-Protocol Discovery:** Seamlessly registers and communicates with both legacy REST devices and modern gRPC hardware.
2. **Smart Database Deduplication:** The background poller actively monitors device health but only writes a new database row when a device's state actually changes, optimizing storage.
3. **State Machine Resilience:** Automatically detects flaky devices, transitioning them through `reachable` → `suspect` → `down` without triggering false offline alarms.
4. **Isolated Sandboxing:** A zero-interference testing architecture allows testing via a dedicated test database without corrupting live production data.

---

## 🚀 QUICK START TRADE SHOW DEMO

Run the automated helper scripts located in `unifi-products-demo/src/` for a seamless presentation:

| Script Name | Command | Primary Purpose |
| --- | --- | --- |
| **`_01_test-final-demo.sh`** | `./_01_test-final-demo.sh` | Runs all 71 Vitest integration tests in a clean sandbox before the presentation. |
| **`_02_start-trade-show.sh`** | `./_02_start-trade-show.sh` | Boots DB, hardware simulators, API service, prints cURL cheat sheet, and tails logs. |
| **`_03_check-dedup.sh`** | `./_03_check-dedup.sh` | Mathematically proves database deduplication with formatted SQL tables & timelines. |
| **`_04_showcase_extra_features.sh`** | `./_04_showcase_extra_features.sh` | Demonstrates unified REST/gRPC responses, telemetry inspection, and Zod error handling. |

### Presentation Execution Steps

1. **Launch Environment:**
```bash
cd unifi-products-demo/src
./_02_start-trade-show.sh

```


2. **Interact with the API (Terminal 2):**
   Copy and paste the cURL commands displayed in the terminal cheat sheet to register REST and gRPC devices.
3. **Verify Extra Features (Terminal 2):**
```bash
./_04_showcase_extra_features.sh

```



---

## 🎭 Live Trade Show Demo Guide

### 1. The "Mic Drop" Deduplication & Resilience Proof

1. **Start the Fleet:** Boot the system and register devices using `./_02_start-trade-show.sh`. Let the poller run for 5–10 cycles.
2. **Show the Lean Database:** Run `./_03_check-dedup.sh`. Point out that even though the poller has executed dozens of health checks, there are only as many diagnostic rows as registered devices (e.g., 6 devices = 6 rows).
3. **Simulate a Hardware Outage:** Open a second terminal and kill a camera container:
```bash
podman-compose -f devices/docker-compose.yml stop camera-rest

```


4. **Watch State Machine Transitions:** In the log terminal, observe the device transition through failure cycles:
* Cycle 1: `reachable` $\rightarrow$ `suspect` (Failures: 1)
* Cycle 2: `suspect` $\rightarrow$ `down` (Failures: 2)


5. **Prove State Transition Write:** Run `./_03_check-dedup.sh` again. Point out that the diagnostic table count incremented by **exactly 1 row** to record the `reachable = false` outage event.
6. **Self-Healing Recovery:** Restart the container:
```bash
podman-compose -f devices/docker-compose.yml start camera-rest

```


The next poll cycle will automatically recover the device to `reachable` (Failures: 0).

---

### 2. Flaky Hardware Behavior: Permanent Offline Simulation

The `door-access-rest` simulator simulates a hardware device that fails permanently after 8 poll attempts.

1. **Observe Failure:** Watch `door-access-rest` fail in the logs and transition to `down`.
2. **Verify Database Record:**
```bash
./_03_check-dedup.sh

```


3. **Reset Simulator:** To restore the device state for repeated testing, restart its container:
```bash
podman restart devices_door-access-rest_1

```



---

### 3. Advanced Features Demonstration

Run the automated script to showcase system capabilities:

```bash
./_04_showcase_extra_features.sh

```

* **Feature 1: Unified REST/gRPC Discovery:** Shows REST devices (`router:4001`) and gRPC devices (`door-access-grpc:4006`) responding through a single unified API endpoint.
* **Feature 2: Deep Telemetry Inspection:** Fetches structured hardware info, firmware versions, software versions, and checksum hashes for a selected device.
* **Feature 3: Input Validation Guardrails:** Posts an invalid payload to prove the Zod schema validation catches errors and returns structured 400 response details.

---

## 🤖 Auto-Register Devices
```bash
cd unifi-products-demo/src
./_05_auto_register_devices.sh
```


## 🔬 Automated Testing & CI/CD Validation

### The Engineering Sandbox (Unit & Integration)

Spins down active containers, provisions an isolated `poc_test` database, and executes 71 tests simulating network timeouts, dead devices, and process lifecycle events.

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
`cURL Client` $\rightarrow$ `Express HTTP API` $\rightarrow$ `Monitoring Service` $\rightarrow$ `Data Access Layer` $\rightarrow$ `PostgreSQL`

| Component | Technology | Location | Port |
| --- | --- | --- | --- |
| **Database** | PostgreSQL 16 | `src/db` | `5432` |
| **Monitoring API** | Node.js / Express | `src/monitoring-service` | `3000` |
| **REST Simulators** | Express (Router, Switch, etc.) | `src/devices/01-rest` | `4001 - 4004` |
| **gRPC Simulators** | gRPC-js (Camera, Door Access) | `src/devices/02-grpc` | `4005 - 4006` |

---

## 💻 Manual Local Development Workflow

To operate the system step-by-step during development:

**1. Start Database**

```bash
cd unifi-products-demo/src/db
podman-compose down -v && podman-compose up -d

```

**2. Start Hardware Simulators**

```bash
cd ../devices
podman-compose down && podman-compose up -d --build

```

**3. Start Monitoring API**

```bash
cd ../monitoring-service
podman-compose down && podman-compose up -d --build

```

**4. Check API Health**

```bash
curl http://localhost:3000/healthz
# Expected: {"ok":true}

```

### Manual API Commands

* **Register REST Router:**
```bash
curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"router-1","address":"router:4001"}'

```


* **Register gRPC Door Access:**
```bash
curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"door-access-grpc-1","address":"door-access-grpc:4006"}'

```


* **List All Devices:**
```bash
curl http://localhost:3000/devices

```


* **View Diagnostics:**
```bash
curl http://localhost:3000/devices/<UUID_HERE>

```


* **Remove Device:**
```bash
curl -i -X DELETE http://localhost:3000/devices/<UUID_HERE>

```
