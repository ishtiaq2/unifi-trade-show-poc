# This is the development Guide

## 1. Create Devices
### How to make all 6 devices up and running
[admin@localhost devices]$ podman-compose up -d
### Test: curl -X GET http://<ip>:<port[4001 to 4006]>/<[health or diagnostics]>
### OR run device-tests
- [admin@localhost devices]$ npx ts-node __tests__/device-test.ts

---

## 2. Setup DB: Next logical step since the Monitoring service is dependent on it.
### 







