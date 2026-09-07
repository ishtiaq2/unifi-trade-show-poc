## Install NVM on VM and Node.js. The purpose is to create package-lock.json
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm i v22
cd devices && npm i
rm -rf node_modules


# *************************** Actual Build ************************************** 
## cd poc/devices

## create shared network
* podman network create unifi-net

## Build the base image using the Dockerfile
* cd devices
* podman build -t unifi-devices .
* Check image: podman images

## Using the base image run different devices

### This will simulate device camera-rest. When run from docker-compose makes it easier:
podman run -d --name camera-rest --network unifi-net -p 4003:4003 unifi-devices npx ts-node camera-rest/index.ts

#### [admin@localhost devices]$ podman exec -it camera-rest ls -l /app 
#### OR
#### podman exec -it camera-rest /bin/sh
#### ls -l 
* -rw-r--r--.  1 root root   294 Sep  6  2026 Dockerfile
* drwxr-xr-x.  2 root root   103 Sep  6 16:28 _shared
* drwxr-xr-x.  2 root root    40 Sep  6 16:27 camera-rest
* drwxr-xr-x. 92 root root  4096 Sep  6 16:34 node_modules
* -rw-r--r--.  1 root root 43909 Sep  6 13:32 package-lock.json
* -rw-r--r--.  1 root root   474 Sep  6 13:32 package.json
#### exit
### health:
[admin@localhost devices]$ curl -X GET "http://localhost:4003/health"
{"protocol":"rest","capabilities":["diagnostics"],"deviceName":"camera-rest-1"}[admin@localhost devices]$

### diagnostics:
[admin@localhost devices]$ curl -X GET "http://localhost:4003/diagnostics"
{"hwVersion":"CAM-HW-1.5","swVersion":"3.2.0","fwVersion":"FW-4.1.0","status":"ok"}[admin@localhost devices]$

### Troubleshoot: 
- curl -X GET http://192.168.1.137:4003/health
- curl: (7) Failed to connect to 192.168.1.137 port 4003 after 0 ms: No route to host
#### Fix: 
- sudo firewall-cmd --add-port=4003/tcp --permanent
- sudo firewall-cmd --reload


# ******************* Repeat the above steps to run more devices ***********************************

### This will simulate device router-rest. When run from docker-compose makes it easier:
podman run -d --name router --network unifi-net -p 4001:4001 unifi-devices npx ts-node router/index.ts


### This will simulate device switch. When run from docker-compose makes it easier:
podman run -d --name switch --network unifi-net -p 4002:4002 unifi-devices npx ts-node switch/index.ts

### This will simulate device door-access-rest. When run from docker-compose makes it easier:
podman run -d --name door-access-rest --network unifi-net -p 4004:4004 unifi-devices npx ts-node door-access-rest/index.ts

### This will simulate device camera-rest-gprc. When run from docker-compose makes it easier:
podman run -d --name camera-grpc --network unifi-net -p 4005:4005 unifi-devices npx ts-node camera-grpc/index.ts

## This will simulate device door-access-gprc. When run from docker-compose makes it easier:
podman run -d --name door-access-grpc --network unifi-net -p 4006:4006 unifi-devices npx ts-node door-access-grpc/index.ts
