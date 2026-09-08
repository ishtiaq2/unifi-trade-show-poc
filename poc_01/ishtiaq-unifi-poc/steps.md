# This is the development life cycle Guide: 
### Identified steps to follow and cover:
#### Constraint: Each step should be independently deployable and testable

✅ 1. Devices                 ← Done
2. Postgres + schema        ← next (nothing above works without it), In Progress
3. Service skeleton          config → pool → /healthz → shutdown
   (no polling yet — just prove it boots and connects)
4. Repository + REST API      POST/GET/DELETE /devices, tested against real Postgres
5. DeviceClient (REST)        talk to your 4 REST devices for real
6. State machine              pure logic, unit-tested, no I/O
7. Poller                     wire 5 + 6 together, add retry/backoff
8. gRPC client                same interface, second implementation
9. ChecksumProvider           the stub seam
10. Life-cycle test            boot the real entrypoint end to end 

## 1. Create Devices
### How to make all 6 devices up and running
[admin@localhost devices]$ podman-compose up -d

### Test: curl -X GET http://<ip>:<port[4001 to 4006]>/<[health or diagnostics]>

### OR run device-tests
- [admin@localhost devices]$ npx ts-node __tests__/device-test.ts

---

## 2. Setup DB: Can be tested/demoed independently also Next logical step since the Monitoring service is dependent on it.
### 







