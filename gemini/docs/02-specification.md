# 🛠️ Technical Specification

## Technology Stack
* **Runtime:** Node.js (v20 LTS)
* **Web Framework:** Express or Fastify (for the REST API)
* **RPC Framework:** `@grpc/grpc-js` and `@grpc/proto-loader`
* **Database:** PostgreSQL (accessed via an ORM like Prisma, or a query builder like Knex)
* **Infrastructure:** Docker & Docker Compose

## Core Architecture Patterns
1. **The Polling Engine:** A background service (e.g., using `setInterval` or a job queue like BullMQ) that iterates over the active device list from the database.
2. **Strategy Pattern (Protocol Abstraction):** 
   * A unified `DeviceClient` interface.
   * `RestDeviceStrategy` and `GrpcDeviceStrategy` implementations. 
   * The polling engine queries the `/health` endpoint, checks capabilities, and instantiates the correct strategy.
3. **Circuit Breaker / Retry Backoff:** Implement an exponential backoff retry mechanism (e.g., using `axios-retry` for REST) to handle the unstable trade show network before marking a device as "offline".
4. **Adapter Pattern (External Binary):** 
   * Since the checksum binary is missing, implement a `ChecksumGenerator` interface.
   * Create a `MockChecksumGenerator` for the PoC.
   * Once the binary is delivered, create a `BinaryChecksumGenerator` utilizing Node's `child_process.spawn`, allowing seamless swapping without touching the core business logic.

## Data Model (High Level)
* **Device:** `id`, `ip_address`, `name`, `capabilities`, `created_at`
* **DeviceStatus:** `id`, `device_id`, `status` (ONLINE/OFFLINE), `hw_version`, `sw_version`, `fw_version`, `checksum`, `timestamp`

## Endpoints
* `POST /api/devices` - Register a new device to monitor.
* `DELETE /api/devices/:id` - Remove a device from monitoring.
* `GET /api/status` - Retrieve the latest aggregated status of all devices.