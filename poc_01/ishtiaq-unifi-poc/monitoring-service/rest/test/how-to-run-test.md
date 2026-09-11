##### monitoring-service/rest/test/how-to-run-test.md

## Create the Test Database
- podman exec -i unifi-db psql -U poc -d postgres -c "CREATE DATABASE poc_test;"
- podman exec -i unifi-db psql -U poc -d poc_test < ../db/postgres/init.sql
- cd rest
- npm install
- npm test 

---

## Manually add a device

curl -X POST http://localhost:3000/devices \
-H "Content-Type: application/json" \
-d '{"name": "Test Switch", "address": "switch:4003"}'

curl -X GET http://192.168.0.45:3000/devices/

curl -s -X DELETE http://192.168.0.45:3000/devices/<id_from_get>

curl -X GET http://192.168.0.45:3000/devices/

---


## How to run state machine test
cd rest
npm test
### Restlt: 
* ✓ test/statemachine.spec.ts (6 tests) 4ms



# 1. Poller test: 
### Drop and recreate the test database to ensure a clean slate
podman exec -i unifi-db psql -U poc -d postgres -c "DROP DATABASE IF EXISTS poc_test;"
podman exec -i unifi-db psql -U poc -d postgres -c "CREATE DATABASE poc_test;"

# 2. Apply the freshly updated schema (with the new 'reachable' column)
podman exec -i unifi-db psql -U poc -d poc_test < ../db/postgres/init.sql

# 3. Run the Poller test specifically
npm test test/poller.spec.ts
