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
* podman build --no-cache -t unifi-devices .
* Check image: podman images

## Using the base image run different devices
### For example to run camera-rest: follow instructions from /devices/camera-rest/docs/01-start-camera.md


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
