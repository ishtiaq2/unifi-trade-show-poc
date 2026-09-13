# A combination of the following

## 1.  Develop devices
unifi-products-demo/src/devices/README.md

## 2. Develop db 
unifi-products-demo/src/db/README.md

## 3. Monitoring Service Data Access Layer (sql-service)
unifi-products-demo/src/monitoring-service/datasource-module/README.md

### Script that proves[1, 2, 3] Devices, Database, Data Access Layer:
cd unifi-trade-show-poc/poc_01/unifi-products-demo/src/monitoring-service/
./test-devices-db-and-data_access_layer.sh



### 4. WebServer (Express APP):
#### App Flow:
* curl  ->  http (app.ts)  ->  monitoringService  ->  sql-service  ->  db
* 

#### Testing Step 4: 

1. Start the database
cd db
podman-compose down -v && podman-compose up -d

2. Start the device simulators
cd ../devices
./clean-slate-devices.sh   # (Press Enter when prompted)

3. Start the monitoring API
cd ../monitoring-service
podman-compose down && podman-compose up -d --build


#### Verify the System is Alive
curl http://localhost:3000/healthz
##### Expected: {"ok":true}
#### Register Devices:

Register a REST router:
curl -X POST http://localhost:3000/devices \
-H "Content-Type: application/json" \
-d '{"name":"router-1","address":"router:4001"}'

Register a gRPC camera
curl -X POST http://localhost:3000/devices \
-H "Content-Type: application/json" \
-d '{"name":"camera-grpc-1","address":"camera-grpc:4005"}'

#### View Device States & Diagnostics
List all devices
curl http://localhost:3000/devices

Grab the UUID of the router from the list above, then check its deep diagnostics
curl http://localhost:3000/devices/<UUID_HERE>

#### Remove a device:
curl -i -X DELETE http://localhost:3000/devices/<UUID_HERE>
# Expected: HTTP/1.1 204 No Content

Alternatively run: 

#### The Automated E2E Verification Script: 
unifi-products-demo/src/monitoring-service/http/__test__/test-api-layer.sh

# The Automated E2E Verification Script:
unifi-products-demo/src/monitoring-service/http/__test__/test-api-layer.sh


---


# UniFi Device Monitoring – Trade Show Demo Guide

Welcome to the live demonstration of the UniFi Device Monitoring Proof of Concept. 
This environment showcases a highly resilient, multi-protocol microservices architecture designed to monitor fleet hardware in real-time.

## 🎯 What This Demo Proves
1. **Multi-Protocol Discovery:** Seamlessly registers and communicates with both legacy REST devices and modern gRPC hardware.
2. **Smart Database Deduplication:** The background poller actively monitors device health but only writes a new database row when a device's state actually changes, massively saving storage.
3. **State Machine Resilience:** Automatically detects flaky devices, transitioning them through `reachable` → `suspect` → `down` without false alarms.
4. **Isolated Sandboxing:** A zero-interference testing architecture that allows rigorous integration testing without corrupting live production data.


## 🚀 The Main Event: Running the Live Fleet Demo
**Execution:**
```bash
cd unifi-products-demo/src
./test-final-demo.sh













