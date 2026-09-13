## 1. architecture.svg:
data-source-module is part of monitoring-service

## 2. Most Urgent
1. Authentication and Authorization
2. RBAC
3. Check that fw, sw, hw changes are reported when changed
4. HTTPS, TLS, mTLS
5. Secrets Management: Move database credentials and internal keys out of docker-compose files and 
into environment secrets (e.g., Vault, AWS Secrets Manager, or container secret mounts).
6. API Rate Limiting & Middleware: Add express-rate-limit to public endpoints to defend against Denial-of-Service (DoS) attacks.
7. Observability & Telemetry
8. Push vs. Pull Model
9. Distributed Poller Workers
10. Data Lifecycle & Storage
11. Frontend & Live Operations (UI/UX)
#### 6. Production Hardening & Security
1. Enforce TLS for REST and mTLS for gRPC device channels.
2. Migrate DB credentials to container secret mounts.
3. Add Express rate-limiting to prevent endpoint abuse.

#### 7. Observability & Alerting
1. Expose Prometheus `/metrics` (poller latency, device state counts).
2. Add Webhook notification hooks (Slack/PagerDuty) on `down` state transitions.
3. Instrument OpenTelemetry for gRPC/REST request tracing.

#### 8. Scalability & Architecture Evolution
1. Decouple Poller using BullMQ/Redis for horizontal scaling across worker nodes.
2. Implement gRPC server streaming for real-time device push events.
3. Partition `device_diagnostics` table for high-volume time-series storage.
4. Add Redis caching layer for `GET /devices` reads.

#### 9. Frontend & Real-Time Dashboard
1. Build a React/Vue Web Dashboard with live status indicators.
2. Implement WebSockets/SSE for real-time status updates without browser polling.


## 3. To Discuss
### 1. A Customer may by only one device, let's say camera:
    * Each device having it's own persistent log
    * Should a not reachable device be dropped until not re-added by admin.

## 4. Verify that UniFi Device Monitoring Fleet demonstration runs cleanly on any developer laptop:
OS (CentOS, Ubuntu, macOS, Windows WSL2), or CI/CD pipeline, perform an environment portability audit across these 5 core layers:
_00_verify_environment.sh


## 5. CI & Portability Verification
name: CI & Portability Verification
on:
push:
branches: [ "main", "master" ]
pull_request:
branches: [ "main", "master" ]

jobs:
verify-and-test:
name: Run Pre-Flight Audit & Test Suite
runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: unifi-products-demo/src

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Make Scripts Executable
        run: chmod +x _*.sh

      - name: 1. Pre-Flight Environment Verification
        run: ./_00_verify_environment.sh

      - name: 2. Run Full Integration & Vitest Test Suite
        run: ./_01_test-final-demo.sh

      - name: 3. Verify Clean Stack Shutdown
        if: always()
        run: |
          (cd db && docker compose down -v) || true
          (cd devices && docker compose down -v) || true
          (cd monitoring-service && docker compose down -v) || true
