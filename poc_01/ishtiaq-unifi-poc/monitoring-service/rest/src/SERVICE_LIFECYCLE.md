# Monitoring Service: Process Lifecycle

This document outlines the architecture and execution flow of the `index.ts` service entry point. 

## Phase 1: Startup & Bootstrap (Fail-Fast Mechanics)

The `start()` sequence follows a strict dependency injection and verification chain. If underlying infrastructure is unavailable, the process fails fast rather than starting in a degraded state.

1. **Configuration Loading:** Retrieves `port` and `databaseUrl` via `loadConfig()`.
2. **Database Verification:** Executes a `SELECT 1` query. The service refuses to boot if PostgreSQL is unreachable.
3. **Dependency Injection Assembly:**
   * Instantiates `SQLService` (Data layer).
   * Injects `SQLService` into both the `MonitoringService` (Business layer) and `Poller` (Background engine).
4. **Engine Activation:** Triggers `poller.start()`.
5. **HTTP Server Binding:** Mounts the Express HTTP routes and opens the TCP listener.

## Phase 2: Active Runtime State

Once booted, the application operates in a dual-engine concurrency model sharing a single Node.js event loop.

```text
               ┌──────────────────────────┐
               │    Node.js Event Loop    │
               └────────────┬─────────────┘
                            │
      ┌─────────────────────┴──────────────────────┐
      ▼ (Passive Thread)           (Active Thread) ▼
┌───────────────────────┐             ┌───────────────────────┐
│   HTTP Inbound API    │             │  Background Poller    │
│  (Express App/Server) │             │  (10s Recursive Loop) │
└───────────────────────┘             └───────────────────────┘

```

## Phase 3: Graceful Shutdown

When the container runtime (Podman, Docker, or Kubernetes) issues a `SIGTERM` or `SIGINT`, the process intercepts the signal and executes a strict, ordered teardown sequence to prevent data corruption or dropped requests.

1. **Halt Background Work:** `poller.stop()` is called immediately to clear the active timer and block any new network checks or database queries.
2. **Drain In-Flight Requests:** `server.close()` stops accepting new HTTP traffic while allowing active requests to finish.
3. **Close Database Sockets:** `pool.end()` safely destroys the PostgreSQL connection pool.

## Key Operational Characteristics

* **Self-Contained Execution:** The `require.main === module` check allows the file to run directly as a standalone process or be imported silently into integration tests without auto-executing the server.
* **Non-Blocking Observability:** The strictly ordered shutdown logic ensures no diagnostic database writes are terminated mid-transaction during a container stop or redeployment.
