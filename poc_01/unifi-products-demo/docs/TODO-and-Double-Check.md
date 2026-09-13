## 1. architecture.sv:
data-source-module is part of monitoring-service

## 2. Most Urgent
1. Authentication and Authorization
2. RBAC
3. Check that fw, sw, hw changes are reported when changed
4. Should a not reachable device be dropped until not re-added by admin.

## 3. To Discuss
### 1. A Customer may by only one device, let's say camera:
    * Each device having it's own persistent log

## 4. Verify that UniFi Device Monitoring Fleet demonstration runs cleanly on any developer laptop:
OS (CentOS, Ubuntu, macOS, Windows WSL2), or CI/CD pipeline, perform an environment portability audit across these 5 core layers:
_00_verify_environment.sh
