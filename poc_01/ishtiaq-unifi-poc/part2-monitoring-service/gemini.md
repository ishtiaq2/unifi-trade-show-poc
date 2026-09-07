Here is the repository setup and architecture for the **`monitoring-service`** repository, structured to build cleanly alongside your `devices` simulators.

---

## 📁 Repository Structure (`monitoring-service/`)

Create a new directory adjacent to `devices` (or inside your workspace root):

```text
monitoring-service/
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                 # Application entry point & service initialization
│   ├── config.ts                # Environment and device inventory definitions
│   ├── types.ts                 # Internal health check & data models
│   ├── db/
│   │   ├── client.ts            # PostgreSQL connection pool (pg / Knex)
│   │   └── schema.sql           # Database tables and migration script
│   ├── poller/
│   │   ├── check-engine.ts      # Core polling engine with retry logic
│   │   ├── rest-client.ts       # HTTP health/diagnostics fetcher
│   │   └── grpc-client.ts       # gRPC health/diagnostics client
│   ├── api/
│   │   ├── server.ts            # Express API for monitoring dashboard / queries
│   │   └── routes.ts            # /devices, /devices/:id/status, /health endpoints
│   └── utils/
│       └── checksum.ts          # Seam for computing device payload checksums

```

---

## 📄 Key File Implementations

### 1. `package.json`

```json
{
  "name": "unifi-monitoring-service",
  "version": "1.0.0",
  "description": "NMS Monitoring Service & Database for Trade-Show PoC",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "db:init": "ts-node src/db/init.ts"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.14.4",
    "@grpc/proto-loader": "^0.8.1",
    "express": "^5.2.1",
    "pg": "^8.11.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.4",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.5.0"
  }
}

```

---

### 2. Database Schema (`src/db/schema.sql`)

This stores historical poll events, computed checksums, and derived reachability vs. device-reported status.

```sql
-- Devices inventory
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    protocol VARCHAR(10) NOT NULL, -- 'rest' or 'grpc'
    host VARCHAR(128) NOT NULL,
    port INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Health check audit log
CREATE TABLE IF NOT EXISTS health_checks (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(64) REFERENCES devices(id),
    reachability VARCHAR(20) NOT NULL, -- 'reachable', 'suspect', 'unreachable'
    device_reported_status VARCHAR(50), -- 'ok', 'degraded', 'unavailable'
    hw_version VARCHAR(50),
    sw_version VARCHAR(50),
    fw_version VARCHAR(50),
    checksum VARCHAR(64),
    response_time_ms INT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_checks_device_time 
ON health_checks (device_id, checked_at DESC);

```

---

### 3. Dockerfile (`Dockerfile`)

Compiles TypeScript ahead of time for a slim, production-ready Node container:

```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY src/db/schema.sql ./dist/db/schema.sql

EXPOSE 3000
CMD ["node", "dist/index.js"]

```

---

### 4. Integration Orchestration (`docker-compose.yml`)

Connects the **PostgreSQL DB** and the **Monitoring Service** onto the existing `unifi-net` container network so it can immediately reach all 6 simulator ports (`4001–4006`):

```yaml
version: '3.8'

networks:
  unifi-net:
    external: true

services:
  postgres-db:
    image: postgres:16-alpine
    container_name: unifi-db
    environment:
      POSTGRES_DB: unifi_nms
      POSTGRES_USER: nms_admin
      POSTGRES_PASSWORD: nms_password_123
    ports:
      - "5432:5432"
    networks:
      - unifi-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nms_admin -d unifi_nms"]
      interval: 5s
      timeout: 5s
      retries: 5

  monitoring-service:
    build: .
    container_name: monitoring-service
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: "postgres://nms_admin:nms_password_123@postgres-db:5432/unifi_nms"
      POLL_INTERVAL_MS: "5000"
      MAX_RETRIES: "3"
    depends_on:
      postgres-db:
        condition: service_healthy
    networks:
      - unifi-net

```

---

### 5. Repository Documentation (`README.md`)

```markdown
# Network Monitoring Service (NMS)

Core monitoring engine responsible for polling multi-protocol device simulators (REST and gRPC), calculating payload checksums, tracking derived reachability vs. device-reported status, and storing audit metrics in PostgreSQL.

## Architecture & Features
- **Multi-Protocol Poller:** Communicates with REST (`http://`) and gRPC endpoints across the `unifi-net` network.
- **Smart Retries:** Ignores single-request drops (e.g., `camera-rest` Wi-Fi flakiness) by transitioning state from `reachable` → `suspect` → `unreachable`.
- **Fault Isolation:** Distinguishes between physical unreachable states and device self-reported failures (e.g., `switch` reporting `degraded`).
- **PostgreSQL Store:** Persistent audit logging of all health checks.

## Quick Start

### 1. Launch DB & Monitoring Service
Ensure the simulator network (`unifi-net`) is active:
```bash
docker compose up -d --build

```

### 2. Verify Output & Service Logs

```bash
docker compose logs -f monitoring-service

```

### 3. Query Monitoring API

```bash
# View all monitored device statuses
curl -s http://localhost:3000/api/v1/devices

```

```

---

<Elicitations message="How would you like to proceed with building out the monitoring engine?">
  <Elicitation label="Write core poller engine" query="Let's write the check-engine.ts and retry logic to poll REST and gRPC simulators."/>
  <Elicitation label="Build DB migration code" query="Let's implement the DB client and auto-migration script for PostgreSQL."/>
  <Elicitation label="Create Express API routes" query="Let's build the Express API routes to query device statuses."/>
</Elicitations>

```
