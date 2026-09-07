## These are the commands used frequently during container setup

* podman stop camera-rest

* podman rm camera-rest

* podman rmi unifi-devices

* podman image prune -a

## Clean slate:
podman stop camera-rest ; podman rm camera-rest ; podman rmi unifi-devices ; podman image prune -a
### Nuke option:
podman rm -af ; podman rmi -af ; podman image prune -af

# Force-stop, remove containers, delete named volumes, and strip local images
podman-compose down -v --rmi local -t 0

# 1. Force-stop and remove ALL containers on the host
podman rm -af
# 2. Force-delete ALL local container images
podman rmi -af
# 3. Clean up all dangling build caches and intermediate layers
podman image prune -af



### Podman-compose
* podman-compose down
podman-compose down -v
podman-compose down --rmi local

* Force Stop and Remove (If containers are stuck)
podman-compose down -t 0

### Debugging + trouble shooting
* podman logs camera-rest

## Build the base image using the Dockerfile
* cd devices
* podman build --no-cache -t unifi-devices .
* Check image: podman images
