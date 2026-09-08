## door-access-rest: 
* When exceeded the healthyRequests: 8 threshold during a test, 
- the device is in its permanently dead goes-down state.

* To reset the door-access-rest device's internal counter, simply restart its container:
- podman restart devices_door-access-rest_1 (check podman ps to find name of the device/container)

