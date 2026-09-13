#!/usr/bin/env bash

# unifi-products-demo/src/monitoring-service/http/__test__/test-api-layer.sh

set -e

# Jump exactly 3 levels up from this script's location to reach the 'src/' directory
cd "$(dirname "${BASH_SOURCE[0]}")/../../../"
BASE_DIR=$(pwd)

echo "====================================================="
echo "  E2E Verification: Database + Devices + HTTP API"
echo "====================================================="
echo "Running from base directory: $BASE_DIR"

echo -e "\n==> 1. Full Teardown..."
(cd monitoring-service && podman-compose down >/dev/null 2>&1) || true
(cd devices && podman-compose down >/dev/null 2>&1) || true
(cd db && podman-compose down -v >/dev/null 2>&1) || true
podman ps --external -aq | xargs -r podman rm -f >/dev/null 2>&1 || true

echo -e "\n==> 2. Starting Database..."
cd db && podman-compose up -d
for i in {1..15}; do
  if podman exec unifi-db pg_isready -U poc >/dev/null 2>&1; then break; fi
  sleep 1
done
cd "$BASE_DIR"

echo -e "\n==> 3. Starting Device Simulators..."
cd devices && podman-compose up -d --build
for port in 4001 4002 4003 4004; do
  for i in {1..15}; do
    if curl -s http://localhost:$port/health | grep -q '"protocol"'; then break; fi
    sleep 2
  done
done
cd "$BASE_DIR"

echo -e "\n==> 4. Starting Monitoring API..."
cd monitoring-service && podman-compose up -d --build
for i in {1..15}; do
  if curl -sf http://localhost:3000/healthz >/dev/null 2>&1; then
    echo "✔ API is healthy!"
    break
  fi
  sleep 2
  if [ "$i" -eq 15 ]; then echo "✖ API failed to boot."; exit 1; fi
done
cd "$BASE_DIR"

echo -e "\n==> 5. Testing HTTP Registration (REST & gRPC)..."
register_device() {
  local name="$1" address="$2"
  local status=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/devices \
    -H "Content-Type: application/json" -d "{\"name\":\"$name\",\"address\":\"$address\"}")
  if [ "$status" -eq 201 ]; then
    echo "  ✔ $name registered via API (201)"
  else
    echo "  ✖ $name failed (HTTP $status)"
    exit 1
  fi
}
register_device "router-1" "router:4001"
register_device "camera-grpc-1" "camera-grpc:4005"

echo -e "\n==> 6. Waiting for Poller & Testing Deduplication..."
WAIT_S=12
echo "Waiting ${WAIT_S}s for the background poller to cycle..."
sleep "$WAIT_S"

# Query DB directly to check deduplication on a stable device (router-1)
COUNT_QUERY="SELECT count(*) FROM diagnostics dg JOIN devices d ON d.id = dg.device_id WHERE d.name = 'router-1';"
LATEST_QUERY="SELECT max(recorded_at) FROM diagnostics dg JOIN devices d ON d.id = dg.device_id WHERE d.name = 'router-1';"

INITIAL_COUNT=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$COUNT_QUERY")
INITIAL_LATEST=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$LATEST_QUERY")

echo "Initial router-1 row count: $INITIAL_COUNT"
echo "Waiting ${WAIT_S}s for next poller cycle..."
sleep "$WAIT_S"

FINAL_COUNT=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$COUNT_QUERY")
FINAL_LATEST=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$LATEST_QUERY")

if [ "$INITIAL_COUNT" -ne "$FINAL_COUNT" ]; then
    echo "✖ Deduplication failed! Row count grew from $INITIAL_COUNT to $FINAL_COUNT."
    exit 1
elif [ "$INITIAL_LATEST" = "$FINAL_LATEST" ]; then
    echo "✖ Poller appears dead (timestamp didn't advance)."
    exit 1
else
    echo "✔ Deduplication is working perfectly! Poller updated timestamp without duplicating rows."
fi

echo -e "\n==> 7. Testing HTTP DELETE..."
ROUTER_ID=$(podman exec unifi-db psql -U poc -d poc -t -A -c "SELECT id FROM devices WHERE name = 'router-1';")
DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "http://localhost:3000/devices/$ROUTER_ID")
if [ "$DELETE_STATUS" -eq 204 ]; then
  echo "✔ Successfully deleted router-1 via API (204 No Content)"
else
  echo "✖ Failed to delete router-1 (HTTP $DELETE_STATUS)"
  exit 1
fi

echo -e "\n====================================================="
echo " ✔ ALL E2E HTTP, POLLER, AND DATABASE TESTS PASSED!"
echo "====================================================="
