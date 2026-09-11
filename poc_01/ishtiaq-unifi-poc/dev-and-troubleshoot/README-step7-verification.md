# Verification Checklist: Up to Step 7

This guide provides a clean-slate teardown and rebuild of the Monitoring Service to verify that the core REST polling engine, State Machine, and Database Deduplication logic are functioning perfectly.

## 1. Clean Teardown
Wipe all existing containers, volumes, and orphaned networks to guarantee a fresh state.

- [ ] Stop all running containers:
  ```bash
  podman-compose down
  
## 2 Remove the persistent database volume
podman volume rm ishtiaq-unifi-poc_db-data
podman system prune -f
