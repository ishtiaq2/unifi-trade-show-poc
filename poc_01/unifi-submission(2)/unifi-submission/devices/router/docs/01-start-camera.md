### This will simulate device router. When run from docker-compose makes it easier:
podman run -d --name router --network unifi-net -p 4001:4001 unifi-devices npx ts-node router/index.ts

#### [admin@localhost devices]$ podman exec -it router ls -l /app
#### OR
#### podman exec -it router /bin/sh
#### ls -l
* -rw-r--r--.  1 root root   294 Sep  6  2026 Dockerfile
* drwxr-xr-x.  2 root root   103 Sep  6 16:28 _shared
* drwxr-xr-x.  2 root root    40 Sep  6 16:27 router
* drwxr-xr-x. 92 root root  4096 Sep  6 16:34 node_modules
* -rw-r--r--.  1 root root 43909 Sep  6 13:32 package-lock.json
* -rw-r--r--.  1 root root   474 Sep  6 13:32 package.json
#### exit
### health:
[admin@localhost devices]$ curl -X GET "http://localhost:4001/health"
{"protocol":"rest","capabilities":["diagnostics"],"deviceName":"router-1"}[admin@localhost devices]$

### diagnostics:
[admin@localhost devices]$ curl -X GET "http://localhost:4001/diagnostics"
{"hwVersion":"CAM-HW-1.5","swVersion":"3.2.0","fwVersion":"FW-4.1.0","status":"ok"}[admin@localhost devices]$

### Troubleshoot:
- curl -X GET http://192.168.1.137:4001/health
- curl: (7) Failed to connect to 192.168.1.137 port 4001 after 0 ms: No route to host
#### Fix:
- sudo firewall-cmd --add-port=4001/tcp --permanent
- sudo firewall-cmd --reload
