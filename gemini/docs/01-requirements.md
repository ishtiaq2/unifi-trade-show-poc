# 📋 Product Requirements

## Overview
A lightweight, highly portable Node.js Proof of Concept (PoC) for monitoring networking devices (routers, switches, cameras) in a volatile trade show environment. The system must aggregate device health and diagnostics, handling unstable network conditions gracefully.

## Functional Requirements
* **Dynamic Device Management:** The system must allow adding or removing monitored devices at runtime without requiring a service restart.
* **Capability Discovery:** The system must query a device's health endpoint to determine supported capabilities and protocols before fetching diagnostics.
* **Diagnostics Retrieval:** The system must retrieve hardware, software, firmware versions, status, and checksums using either REST or gRPC, depending on the device's advertised capabilities.
* **Resiliency & State Management:** The system must handle unstable trade show networks (e.g., dropped packets, high latency) without triggering false down-state alarms.
* **Aggregated Status API:** The system must expose an API for the frontend/dashboard to retrieve the latest state of all monitored devices instantly.
* **Offline Inspection:** All device identities, statuses, and diagnostics must be persisted to a PostgreSQL database so they can be reviewed even if the devices go offline.
* **Extensibility:** The system must accommodate a yet-to-be-delivered external binary executable for checksum generation.

## Implicit/Non-Functional Requirements ("Between the Lines")
* **Extreme Portability:** The solution must be containerized (Docker/Docker Compose) to run smoothly across varying OS environments at the convention center.
* **Future-Proofing:** While a PoC, the code must be structured using clean architecture principles so it can evolve into a production service.
* **Developer Experience:** The repository must be trivial to spin up (`docker-compose up`) and easy to test by colleagues.

