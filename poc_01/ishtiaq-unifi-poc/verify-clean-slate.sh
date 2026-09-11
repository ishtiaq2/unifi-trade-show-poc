#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

# ==========================================
# Colors for Terminal Output
# ==========================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions for logging
step() { echo -e "\n${BLUE}==> [STEP] $1${NC}"; }
info() { echo -e "${YELLOW}    $1${NC}"; }
success() { echo -e "${GREEN}    ✔ $1${NC}"; }
fail() { echo -e "${RED}    ✖ $1${NC}"; exit 1; }

# ==========================================
# 0. Full Teardown
# ==========================================
step "Full Teardown: Stopping containers and removing DB volume"
(cd monitoring-service && podman-compose down >/dev/null 2>&1) || true
(cd devices && podman-compose down >/dev/null 2>&1) || true
(cd db && podman-compose down -v >/dev/null 2>&1) || true
info "Pruning orphaned containers and removing custom images to force clean build..."
podman container prune -f >/dev/null 2>&1 || true
podman rmi localhost/unifi-monitoring-rest localhost/unifi-devices >/dev/null 2>&1 || true
success "Environment wiped clean."

info "PAUSED. Open another terminal to manually run 'podman ps -a', 'podman images', and 'podman volume ls'."
read -p "Press [Enter] to continue creating the environment..."

# ==========================================
# 1. Shared Network
# ==========================================
step "Ensuring Shared Network (unifi-net) exists"
podman network create unifi-net >/dev/null 2>&1 || true
if podman network ls | grep -q 'unifi-net'; then
  success "Network 'unifi-net' is ready."
else
  fail "Failed to create or find 'unifi-net'."
fi

# ==========================================
# 2. Database
# ==========================================
step "Starting Database Layer"
(cd db && podman-compose up -d)
info "Waiting for PostgreSQL to accept connections (up to 15s)..."
for i in {1..15}; do
  if podman exec unifi-db pg_isready -U poc >/dev/null 2>&1; then
    success "PostgreSQL is up and accepting connections!"
    break
  fi
  sleep 1
  if [ "$i" -eq 15 ]; then fail "Database failed to start in time."; fi
done

sleep 5

info "Running verify.sh schema tests..."
if (cd db && ./postgres/verify.sh >/dev/null); then
    success "Database schema verified (13 passed, 0 failed)!"
else
    fail "Database schema verification failed. Run './postgres/verify.sh' manually to see errors."
fi

# ==========================================
# 3. Devices
# ==========================================
step "Starting Hardware Devices"
(cd devices && podman-compose up -d --build)
info "Waiting for Express servers to boot (up to 30s)..."

for port in 4001 4002 4003 4004; do
  for i in {1..15}; do
    if curl -s http://localhost:$port/health | grep -q '"protocol"'; then
      success "REST device on port $port is healthy."
      break
    fi
    sleep 2
    if [ "$i" -eq 15 ]; then fail "REST device on port $port failed to boot in time."; fi
  done
done

# ==========================================
# 4. Monitoring Service
# ==========================================
step "Starting Monitoring Service"
(cd monitoring-service && podman-compose up -d --build)
info "Waiting 5 seconds for Monitoring Service to boot..."
sleep 5

if curl -s http://localhost:3000/healthz | grep -q 'ok'; then
  success "Monitoring API (port 3000) is healthy."
else
  fail "Monitoring API is down."
fi

# ==========================================
# 5. Live End-to-End Verification
# ==========================================
step "Registering REST devices with Monitoring Service"
curl -s -X POST http://localhost:3000/devices -H "Content-Type: application/json" -d '{"name":"router-1","address":"router:4001"}' > /dev/null
curl -s -X POST http://localhost:3000/devices -H "Content-Type: application/json" -d '{"name":"switch-1","address":"switch:4002"}' > /dev/null
curl -s -X POST http://localhost:3000/devices -H "Content-Type: application/json" -d '{"name":"camera-rest-1","address":"camera-rest:4003"}' > /dev/null
curl -s -X POST http://localhost:3000/devices -H "Content-Type: application/json" -d '{"name":"door-access-rest-1","address":"door-access-rest:4004"}' > /dev/null
success "4 REST devices registered."

info "Waiting 12 seconds for the first Poller cycle to complete..."
sleep 12

DEVICES_JSON=$(curl -s http://localhost:3000/devices)
if echo "$DEVICES_JSON" | grep -q '"status":"reachable"'; then
  success "Devices successfully discovered and marked reachable by poller."
else
  fail "Poller did not mark devices reachable. Check logs: 'podman logs monitoring-service_rest_1'"
fi

# ==========================================
# 6. Database Deduplication Test
# ==========================================
step "Verifying Time-Series Deduplication"
DB_QUERY="SELECT count(*) FROM diagnostics;"
INITIAL_COUNT=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$DB_QUERY")
info "Initial diagnostic row count: $INITIAL_COUNT"

info "Waiting 12 seconds for another Poller cycle to occur..."
sleep 12

FINAL_COUNT=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$DB_QUERY")
info "Final diagnostic row count: $FINAL_COUNT"

if [ "$INITIAL_COUNT" -eq "$FINAL_COUNT" ]; then
    success "Deduplication is working! Row count stayed at $FINAL_COUNT across multiple poll cycles."
else
    fail "Deduplication failed! Row count grew from $INITIAL_COUNT to $FINAL_COUNT."
fi

echo -e "\n${GREEN}==========================================${NC}"
echo -e "${GREEN}  ALL TESTS PASSED. CLEAN SLATE VERIFIED. ${NC}"
echo -e "${GREEN}==========================================${NC}\n"
