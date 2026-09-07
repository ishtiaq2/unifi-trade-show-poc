### This will simulate device switch. When run from docker-compose makes it easier:
podman run -d --name switch --network unifi-net -p 4003:4003 unifi-devices npx ts-node switch/index.ts

#### [admin@localhost devices]$ podman exec -it switch ls -l /app
#### OR
#### podman exec -it switch /bin/sh
#### ls -l
* -rw-r--r--.  1 root root   294 Sep  6  2026 Dockerfile
* drwxr-xr-x.  2 root root   103 Sep  6 16:28 _shared
* drwxr-xr-x.  2 root root    40 Sep  6 16:27 switch
* drwxr-xr-x. 92 root root  4096 Sep  6 16:34 node_modules
* -rw-r--r--.  1 root root 43909 Sep  6 13:32 package-lock.json
* -rw-r--r--.  1 root root   474 Sep  6 13:32 package.json
#### exit
### health:
[admin@localhost devices]$ curl -X GET "http://localhost:4003/health"
{"protocol":"rest","capabilities":["diagnostics"],"deviceName":"switch-1"}[admin@localhost devices]$

### diagnostics:
[admin@localhost devices]$ curl -X GET "http://localhost:4003/diagnostics"
{"hwVersion":"CAM-HW-1.5","swVersion":"3.2.0","fwVersion":"FW-4.1.0","status":"ok"}[admin@localhost devices]$

### Troubleshoot:
- curl -X GET http://192.168.1.137:4003/health
- curl: (7) Failed to connect to 192.168.1.137 port 4003 after 0 ms: No route to host
#### Fix:
- sudo firewall-cmd --add-port=4003/tcp --permanent
- sudo firewall-cmd --reload
