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
