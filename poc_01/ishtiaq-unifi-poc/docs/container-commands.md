## These are the commands used frequently during container setup

* podman stop camera-rest

* podman rm camera-rest

* podman rmi unifi-devices

* podman image prune -a

## Clean slate:
podman stop camera-rest ; podman rm camera-rest ; podman rmi unifi-devices ; podman image prune -a
### Nuke option:
podman rm -af ; podman rmi -af ; podman image prune -af

### Debugging + trouble shooting
* podman logs camera-rest
