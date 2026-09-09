# Iterative, Test-Driven Development Architecture

## This is the development life cycle Guide:
### Identified steps to follow and cover:
#### Constraint: Each step should be independently deployable and testable

✅ 1. Devices                 ← Done
✅ 2. Postgres + schema        ← next (nothing above works without it)
✅ 3. Service skeleton          config → pool → /healthz → shutdown
✅ 4. Repository + REST API      POST/GET/DELETE /devices, tested against real Postgres
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


## Bringing the system up through step 5

### 1. Devices
cd ../devices
podman-compose up -d
curl -x GET http://localhost:<4001-4004>/health

### 2. Database
   cd db
   podman-compose up -d
   ./postgres/verify.sh          # expect: 13 passed, 0 failed

   * Shared network (skip if already done)
      podman network ls | grep unifi-net
      or, for a detailed info
      podman network inspect unifi-net

   * if not connected
      podman network create unifi-net
      podman network connect unifi-net unifi-db
      podman inspect unifi-db --format '{{.NetworkSettings.Networks}}'

### 3. Monitoring service
cd ../monitoring-service
podman-compose up --build
* Confirm it's connected and answering:
- curl -s http://localhost:3000/healthz
  - {"ok":true}

#### curl examples — real responses shown for each

   * Register a device (protocol resolves via real discovery):
     curl -X POST http://localhost:3000/devices \
     -H "Content-Type: application/json" \
     -d '{"name":"router-1","address":"router:4001"}'
    
   * List everything:
   - curl http://localhost:3000/devices
   - curl http://localhost:3000/devices/<id>

### 4. Checking what's actually stored in the database
   - podman exec -it unifi-db psql -U poc -d poc -c "select * from devices"
   - OR
   - podman exec -it unifi-db psql -U poc -d poc   
   - Exit psql with \q
