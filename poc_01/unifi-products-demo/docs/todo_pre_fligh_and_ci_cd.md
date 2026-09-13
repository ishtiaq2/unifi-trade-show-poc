Here is the step-by-step trade show script using your six automated helper scripts. It is structured into four distinct acts, complete with terminal commands, key visual callouts, and exact talking points.

---

### Act 1: The Pre-Show Engineering Guarantee (Pre-Flight & CI/CD)

**Goal:** Establish immediate technical credibility by proving the environment is verified and unit-tested before touching live code.

#### 1. Environment Verification

* **Terminal Command (Terminal 1):**
```bash
./_00_verify_environment.sh

```


* **What to Say:**
> *"Before booting any infrastructure, our system runs a zero-dependency pre-flight check. It verifies CLI tooling, auto-detects whether the host is running Podman or Docker Compose, and scans required host ports for conflicts. This guarantees the entire demonstration environment is portable across any cloud instance or developer laptop."*


* **What to Highlight on Screen:** Point out the green checkmarks confirming CLI tools, container engine detection, and available ports `3000`–`5432` & `4001`–`4006`.

#### 2. Isolated Test Suite

* **Terminal Command (Terminal 1):**
```bash
./_01_test-final-demo.sh

```


* **What to Say:**
> *"To ensure trade-show reliability, we run our automated Vitest integration suite inside an isolated sandbox database. It evaluates 71 distinct test cases—simulating network dropouts, dead devices, and process crashes—without touching production tables."*


* **What to Highlight on Screen:** Point to the Vitest pass indicator showing `71 passed`.

---

### Act 2: Live Fleet Launch & Dynamic Discovery

**Goal:** Boot the microservice fleet, stream real-time logs, and demonstrate dynamic container auto-registration.

#### 1. Launch Stack

* **Terminal Command (Terminal 1):**
```bash
./_02_start-trade-show.sh

```


* **What to Say:**
> *"Now we bring up our production architecture: a PostgreSQL 16 database, six heterogeneous hardware simulators, and our Express-based monitoring engine. As you can see in the live log stream, the background poller is active and executing health probes every 10 seconds."*



#### 2. Auto-Registration

* **Terminal Command (Terminal 2):**
```bash
./_05_auto_register_devices.sh

```


* **What to Say:**
> *"Rather than manually entering REST or gRPC configuration payloads, our discovery engine inspects active container runtime states. It cross-references running hardware with registered devices in PostgreSQL, automatically onboarding new devices without duplicate entries."*


* **What to Highlight on Screen:** In Terminal 1, show the log entries transitioning to:
  `[HEARTBEAT] camera-rest-1 is reachable (Failures: 0)`

---

### Act 3: The "Mic Drop" Deduplication & Fault Injection Proof

**Goal:** Prove smart database deduplication and live state machine transitions under simulated hardware failure.

#### 1. The Lean Database Baseline

* **Terminal Command (Terminal 2):**
```bash
./_03_check-dedup.sh

```


* **What to Say:**
> *"Notice our database metrics: the background poller has fired dozens of health checks, yet there are only 6 diagnostic rows in PostgreSQL—exactly one per device. Traditional pollers write every cycle and bloat storage. Our engine deduplicates at the database layer, storing new records only when state transitions occur."*


* **What to Highlight on Screen:** Point out `Registered Devices: 6` and `Total Diagnostic Rows: 6`.

#### 2. Fault Injection & State Machine Transition

* **Terminal Command (Terminal 2):**
```bash
podman-compose -f devices/docker-compose.yml stop camera-rest

```


* **What to Say:**
> *"Let's simulate a physical hardware failure by killing a camera container mid-stream. Watch the central monitoring log in Terminal 1."*


* **What to Highlight in Terminal 1 Logs:**
1. **Poll 1:** Device misses heartbeat $\rightarrow$ State transitions from `reachable` to `suspect` (Failures: 1). Explain: *"Our state machine avoids false alarms caused by momentary network blips."*
2. **Poll 2:** Second missed heartbeat $\rightarrow$ State transitions from `suspect` to `down` (Failures: 2). Explain: *"Two consecutive failures confirm the outage and flag the device down."*



#### 3. Proving the Minimal Write

* **Terminal Command (Terminal 2):**
```bash
./_03_check-dedup.sh

```


* **What to Say:**
> *"Running our deduplication query again, total diagnostic rows incremented from 6 to 7. The system recorded exactly one event capturing the transition to `reachable = false`, preserving full timeline auditing with zero storage overhead."*



#### 4. Self-Healing Recovery

* **Terminal Command (Terminal 2):**
```bash
podman-compose -f devices/docker-compose.yml start camera-rest

```


* **What to Say:**
> *"When the container recovers, the poller detects the hardware automatically on the next cycle, resets consecutive failures to 0, and restores the operational state."*



---

### Act 4: Protocol Agnosticism & Validation Guardrails

**Goal:** Showcase unified REST/gRPC abstractions, deep telemetry payloads, and input validation security.

* **Terminal Command (Terminal 2):**
```bash
./_04_showcase_extra_features.sh

```


* **What to Say:**
> *"To conclude, our system delivers three key enterprise guarantees:"*


1. **Protocol Normalization:** *"Section 1 shows HTTP REST endpoints and high-performance gRPC channels abstracted into a single, normalized schema interface."*
2. **Deep Telemetry Extraction:** *"Section 2 demonstrates how healthy polls pull hardware revisions, software versions, firmware builds, and cryptographically verified checksums."*
3. **Schema Validation Guardrails:** *"Section 3 proves production safety. Invalid API payloads are rejected instantly by Zod schemas at the HTTP boundary with structured 400 Bad Request error messaging, protecting internal domain logic."*



---

### Quick Script Reference

| Act | Script Name | Key Takeaway |
| --- | --- | --- |
| **Act 1** | `./_00_verify_environment.sh` & `./_01_test-final-demo.sh` | Zero-dependency pre-flight checks and 71 passed integration tests. |
| **Act 2** | `./_02_start-trade-show.sh` & `./_05_auto_register_devices.sh` | Live microservices boot with automated runtime discovery. |
| **Act 3** | `./_03_check-dedup.sh` | Proof of deduplicated PostgreSQL storage and fault-tolerant state machine logic. |
| **Act 4** | `./_04_showcase_extra_features.sh` | Protocol normalization (REST/gRPC), telemetry inspection, and Zod security guardrails. |
