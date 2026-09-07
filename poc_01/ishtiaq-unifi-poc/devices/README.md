# Mock Device Simulators

Six standalone device simulators standing in for trade-show hardware
(routers, switches, cameras, and door-access systems) across both REST and
gRPC protocols. **These are test fixtures, not the graded deliverable** —
the monitoring service in `../monitoring-service/` is.
They exist to give the service real network targets to monitor and to make
demo environments reproducible without physical hardware.

---

## Device Catalog

| Device | Protocol | Port | Behavior Profile | Purpose |
| --- | --- | --- | --- | --- |
| `router` | REST | 4001 | Always healthy (`failureMode: "none"`) | Control baseline case

|
| `switch` | REST | 4002 | Reachable, but self-reports `degraded` | Tests reachability vs. device health distinction

|
| `camera-rest` | REST | 4003 | Flaky (~15% drop rate per request) | Proves retry logic prevents false `down` alarms

|
| `door-access-rest` | REST | 4004 | Healthy for 8 requests, then permanently down | Proves true offline detection triggers

|
| `camera-grpc` | gRPC | 4005 | Always healthy | gRPC protocol verification baseline |
| `door-access-grpc` | gRPC | 4006 | Always healthy | gRPC protocol verification baseline |

### Behavioral Scenarios

* **`camera-rest`**: Simulates an unstable wireless link. The monitoring service must show `suspect` during transient drops and automatically recover without triggering a false "down" alert.


* **`door-access-rest`**: Simulates a physical failure or cable disconnect. Guarantees the service's "no false alarms" requirement isn't trivially satisfied by a system that fails to report genuine outages.


* **`switch`**: Perfectly reachable over the network while explicitly self-reporting an internal fault (`degraded`). Demonstrates that derived reachability and device-reported health status are tracked as independent facts.



---

## Architecture & Hierarchy

The project uses a single shared implementation per protocol where individual device folders only provide configuration profiles.

```
                               DeviceProfile
                                     │
                                     ▼
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
           createRestDevice()                createGrpcDevice()
                    │                                 │
   ┌───────────┬────┴──────┬───────────┐         ┌────┴──────────────┐
   ▼           ▼           ▼           ▼         ▼                   ▼
 Router      Switch   Camera-REST Door-REST Camera-gRPC       Door-gRPC
 :4001       :4002       :4003       :4004     :4005               :4006

               Fig 1. Separation of configuration from behavior.

```

---

## Prerequisites & Installation

### 1. Environment Setup (CentOS Host)

Ensure Node.js v22 and package management tools are installed:

```bash
# Install NVM & Node.js v22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22

# Install Python Pip (Required if podman-compose is not in EPEL)
sudo dnf install -y python3-pip

# Install podman-compose
pip3 install --user podman-compose
export PATH=$PATH:~/.local/bin

```

### 2. Generate Dependency Lockfile

Run `npm install` once on the host to generate a clean `package-lock.json`, then clean up the local `node_modules` before containerization:

```bash
cd devices
npm install
rm -rf node_modules

```

---

## Deployment Options

### Option A: Standard Deployment (Recommended)

Launch all 6 simulators simultaneously using `podman-compose`:

```bash
cd devices

# Build and start all services in the background
podman-compose up -d --build

# Check running containers
podman ps

# Stop all services
podman-compose down

```

---

### Option B: Individual Container Deployment

To run devices manually or test an isolated container:

```bash
# 1. Create the shared network
podman network create unifi-net

# 2. Build the unified base image
cd devices
podman build --no-cache -t unifi-devices .

# 3. Launch individual devices as needed
podman run -d --name router --network unifi-net -p 4001:4001 unifi-devices npx ts-node router/index.ts
podman run -d --name switch --network unifi-net -p 4002:4002 unifi-devices npx ts-node switch/index.ts
podman run -d --name camera-rest --network unifi-net -p 4003:4003 unifi-devices npx ts-node camera-rest/index.ts
podman run -d --name door-access-rest --network unifi-net -p 4004:4004 unifi-devices npx ts-node door-access-rest/index.ts
podman run -d --name camera-grpc --network unifi-net -p 4005:4005 unifi-devices npx ts-node camera-grpc/index.ts
podman run -d --name door-access-grpc --network unifi-net -p 4006:4006 unifi-devices npx ts-node door-access-grpc/index.ts

```

---

## Endpoint Verification

### REST Devices (`curl`)

Test capability discovery and diagnostic reporting endpoints:

```bash
# Router (Baseline OK)
curl -s http://localhost:4001/health
# {"protocol":"rest","capabilities":["diagnostics-ts"],"deviceName":"router-1"}

curl -s http://localhost:4001/diagnostics
# {"name":"router-1","hwVersion":"RTR-HW-2.1","swVersion":"1.4.0","fwVersion":"FW-9.2.3","status":"ok"}

# Switch (Degraded Status)
curl -s http://localhost:4002/diagnostics
# {"name":"switch-1","hwVersion":"SW-HW-3.0","swVersion":"2.1.1","fwVersion":"FW-7.0.0","status":"degraded"}

# Door Access (Fails after 8 calls)
curl -s http://localhost:4004/health
# Returns 503 {"error":"unavailable"} after request threshold is met

```

### gRPC Devices (`test-grpc-client.ts`)

Since standard HTTP/1.1 `curl` cannot frame gRPC protocol buffers, use the included Node client to inspect gRPC endpoints:

```bash
# Test Camera gRPC
npx ts-node _shared/test-grpc-client.ts localhost:4005

# Test Door Access gRPC
npx ts-node _shared/test-grpc-client.ts localhost:4006

```

---

## Troubleshooting & Reset

| Issue | Cause | Resolution |
| --- | --- | --- |
| `curl: (7) Failed to connect / No route to host` | Firewall blocking host ports | Open ports on CentOS host: <br>

<br>`sudo firewall-cmd --add-port=4001-4006/tcp --permanent`<br>

<br>`sudo firewall-cmd --reload` |
| `TypeError: Cannot read properties of undefined (reading 'fileExists')` | Missing TypeScript binary in container or broken cache layer | Rebuild base image without cache: <br>

<br>`podman build --no-cache -t unifi-devices .` |
| Containers immediately exit on `podman-compose up` | Missing `command` in `docker-compose.yml` or missing script aliases | Ensure `package.json` contains script mappings (`"router": "ts-node router/index.ts"`) or update `docker-compose.yml` to use direct `npx ts-node` executions. |
| `podman-compose: command not found` | Binary not in system `PATH` | Run `export PATH=$PATH:~/.local/bin` or execute via Python: `python3 -m podman_compose up -d` |
| Reset door access failure counter | Container request limit reached | Reset memory state: `podman restart door-access-rest` |
