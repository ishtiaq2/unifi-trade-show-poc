# UniFi Devices 

## Create Devices [Router, Switch, Camera, Door Access] and run:
### podman-compose up -d --build by running:
./clean-slate-devices.sh 


To Access:
# Router (Port 4001)
curl http://localhost:4001/health
curl http://localhost:4001/diagnostics

# Switch (Port 4002)
curl http://localhost:4002/health
curl http://localhost:4002/diagnostics

# Camera (Port 4003) - Note: Programmed to occasionally fail (15% flaky rate)
curl http://localhost:4003/health

# Door Access (Port 4004) - Note: Programmed to permanently fail after 8 requests
curl http://localhost:4004/health
