#!/usr/bin/env bash
set -e

# Jump to the src/ directory wherever the script is run from
cd "$(dirname "${BASH_SOURCE[0]}")"
BASE_DIR=$(pwd)

echo "====================================================="
echo "  FINAL DEMO: Full Fleet E2E & Poller Verification"
echo "====================================================="

# ---------------------------------------------------------
# 1. CLEAN SLATE
# ---------------------------------------------------------
echo -e "\n==> 1. Wiping Environment & Starting Clean..."
(cd monitoring-service && podman-compose down >/dev/null 2>&1) || true
(cd devices && podman-compose down >/dev/null 2>&1) || true
(cd db && podman-compose down -v >/dev/null 2>&1) || true

echo "Starting Database..."
cd "$BASE_DIR/db" && podman-compose up -d
for i in {1..15}; do
  if podman exec unifi-db pg_isready -U poc >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "Starting Devices..."
cd "$BASE_DIR/devices" && podman-compose up -d --build

echo "Starting Monitoring API..."
cd "$BASE_DIR/monitoring-service" && podman-compose up -d --build
for i in {1..15}; do
  if curl -sf http://localhost:3000/healthz >/dev/null 2>&1; then break; fi
  sleep 2
done

# ---------------------------------------------------------
# 2. VERIFY HARDWARE SIMULATORS DIRECTLY
# ---------------------------------------------------------
echo -e "\n==> 2. Verifying Hardware Simulators Directly..."

# Verify REST Devices (Ports 4001-4004) with a boot-up wait loop
for port in 4001 4002 4003 4004; do
  echo -n "  Waiting for REST device on port $port to boot... "
  SUCCESS=0
  for i in {1..15}; do
    HEALTH=$(curl -s http://localhost:$port/health || true)
    if echo "$HEALTH" | grep -q '"protocol"'; then
      echo "✔ Ready"
      SUCCESS=1
      break
    fi
    sleep 2
  done

  if [ "$SUCCESS" -eq 0 ]; then
    echo "✖ Failed to boot in time"
    exit 1
  fi
done

# Verify gRPC Devices (Ports 4005-4006)
for port in 4005 4006; do
  echo -n "  Testing gRPC device on port $port... "
  SUCCESS=0
  for i in {1..15}; do
    if </dev/tcp/localhost/$port 2>/dev/null; then
      echo "✔ Socket open and listening"
      SUCCESS=1
      break
    fi
    sleep 2
  done

  if [ "$SUCCESS" -eq 0 ]; then
    echo "✖ Failed to connect to gRPC port"
    exit 1
  fi
done

# ---------------------------------------------------------
# 3. REGISTER FLEET VIA HTTP API
# ---------------------------------------------------------
echo -e "\n==> 3. Registering Full Fleet to Monitoring API..."
register_device() {
  local name="$1" address="$2"
  curl -s -o /dev/null -w "  ✔ Registered %{url_effective} -> $name\n" -X POST http://localhost:3000/devices \
    -H "Content-Type: application/json" -d "{\"name\":\"$name\",\"address\":\"$address\"}"
}

register_device "router-1" "router:4001"
register_device "switch-1" "switch:4002"
register_device "camera-rest" "camera-rest:4003"
register_device "door-access-rest" "door-access-rest:4004"
register_device "camera-grpc" "camera-grpc:4005"
register_device "door-access-grpc" "door-access-grpc:4006"

# ---------------------------------------------------------
# 4. VERIFY BACKGROUND POLLER & DEDUPLICATION
# ---------------------------------------------------------
echo -e "\n==> 4. Validating Poller Database Updates (Waiting 15s)..."
sleep 15

# Get initial row counts for the whole fleet
INITIAL_DEVICES=$(podman exec unifi-db psql -U poc -d poc -t -A -c "SELECT count(*) FROM devices;")
INITIAL_DIAGS=$(podman exec unifi-db psql -U poc -d poc -t -A -c "SELECT count(*) FROM diagnostics;")
INITIAL_LATEST=$(podman exec unifi-db psql -U poc -d poc -t -A -c "SELECT sum(extract(epoch from recorded_at)) FROM diagnostics;")

echo "  Devices in DB: $INITIAL_DEVICES / 6"
echo "  Diagnostics Rows: $INITIAL_DIAGS (Should equal registered devices)"

if [ "$INITIAL_DEVICES" -ne 6 ]; then
  echo "✖ Registration failed: Expected 6 devices, found $INITIAL_DEVICES"
  exit 1
fi

echo -e "\n  Waiting 12s for next poll cycle to verify deduplication..."
sleep 12

FINAL_DIAGS=$(podman exec unifi-db psql -U poc -d poc -t -A -c "SELECT count(*) FROM diagnostics;")
FINAL_LATEST=$(podman exec unifi-db psql -U poc -d poc -t -A -c "SELECT sum(extract(epoch from recorded_at)) FROM diagnostics;")

if [ "$INITIAL_DIAGS" -ne "$FINAL_DIAGS" ]; then
  echo "✖ Deduplication Failed! Row count grew from $INITIAL_DIAGS to $FINAL_DIAGS."
  exit 1
elif [ "$INITIAL_LATEST" = "$FINAL_LATEST" ]; then
  echo "✖ Poller is dead! Timestamps in the database did not advance."
  exit 1
else
  echo "  ✔ Diagnostics rows remained at $FINAL_DIAGS (No duplicates created)"
  echo "  ✔ Timestamps advanced successfully (Poller is actively writing to DB)"
fi

# ---------------------------------------------------------
# 5. VERIFY OUTAGE PRESERVATION (the other half of dedup)
# ---------------------------------------------------------
# Section 4 proves repeated HEALTHY readings collapse into one row.
# This proves the harder, more important half: when a device actually
# goes down and later recovers, the outage row is PERMANENTLY KEPT
# rather than being overwritten by the recovery.
#
# Without this check, a bug that simply overwrote the latest row on
# every change would pass section 4 perfectly while silently
# destroying exactly the history an operator needs after the fact.
echo -e "\n==> 5. Validating Outage Preservation (stop a device, then restart it)..."

TARGET="devices_camera-rest_1"
DEVICE_NAME="camera-rest"

# Container naming is derived by podman-compose (<project>_<service>_1)
# and depends on the directory name. Resolve it dynamically rather than
# hardcoding, so this section fails loudly if it can't find the
# container instead of silently "passing" by stopping nothing.
if ! podman ps --format '{{.Names}}' | grep -q "^${TARGET}$"; then
  RESOLVED=$(podman ps --format '{{.Names}}' | grep "camera-rest" | head -1)
  if [ -n "$RESOLVED" ]; then
    TARGET="$RESOLVED"
  else
    echo "✖ Could not find a running camera-rest container. Cannot test outage preservation."
    podman ps --format '{{.Names}}'
    exit 1
  fi
fi
echo "  Using container: $TARGET"

BEFORE_FAILED=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT count(*) FROM diagnostics dg JOIN devices d ON d.id=dg.device_id
   WHERE d.name='$DEVICE_NAME' AND dg.reachable = false;")

echo "  Stopping $TARGET to simulate a real outage..."
podman stop "$TARGET" >/dev/null 2>&1

# FAILURE_THRESHOLD defaults to 3, POLL_INTERVAL_MS to 10s, so the
# device needs ~3 cycles to be marked down. 40s covers that with margin.
echo "  Waiting 40s for the poller to observe the outage..."
sleep 40

DOWN_STATUS=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT status FROM devices WHERE name='$DEVICE_NAME';")
AFTER_FAILED=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT count(*) FROM diagnostics dg JOIN devices d ON d.id=dg.device_id
   WHERE d.name='$DEVICE_NAME' AND dg.reachable = false;")

echo "  $DEVICE_NAME status during outage: $DOWN_STATUS"
if [ "$AFTER_FAILED" -le "$BEFORE_FAILED" ]; then
  echo "✖ No unreachable row was recorded for the outage."
  podman start "$TARGET" >/dev/null 2>&1
  exit 1
fi
echo "  ✔ Outage recorded as a reachable=false row"

echo "  Restarting $TARGET (device comes back online)..."
podman start "$TARGET" >/dev/null 2>&1
echo "  Waiting 25s for the poller to observe the recovery..."
sleep 25

RECOVERED_STATUS=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT status FROM devices WHERE name='$DEVICE_NAME';")
PRESERVED=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT count(*) FROM diagnostics dg JOIN devices d ON d.id=dg.device_id
   WHERE d.name='$DEVICE_NAME' AND dg.reachable = false;")

echo "  $DEVICE_NAME status after recovery: $RECOVERED_STATUS"

if [ "$RECOVERED_STATUS" != "reachable" ]; then
  echo "✖ Device did not recover to 'reachable' after restart."
  exit 1
fi
if [ "$PRESERVED" -lt "$AFTER_FAILED" ]; then
  echo "✖ PRESERVATION FAILED: outage rows dropped from $AFTER_FAILED to $PRESERVED after recovery."
  echo "  The outage history was overwritten — this is the bug this check exists to catch."
  exit 1
fi
echo "  ✔ Device recovered to 'reachable'"
echo "  ✔ Outage row(s) still present after recovery ($PRESERVED) — history preserved, not overwritten"

# ---------------------------------------------------------
# 6. DEMO-DAY SANITY: the things that actually break on stage
# ---------------------------------------------------------
echo -e "\n==> 6. Demo-day sanity checks..."

# A device the service can't reach must still register (gear gets added
# while still booting at a trade show) — and must NOT be reported down
# on the very first failed check.
GHOST=$(curl -s -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"not-plugged-in-yet","address":"192.0.2.1:9999"}')
if echo "$GHOST" | grep -q '"id"'; then
  echo "  ✔ A not-yet-reachable device still registers (protocol stays null)"
else
  echo "✖ Registering an unreachable device failed — gear can't be pre-added."
  exit 1
fi

GHOST_ID=$(echo "$GHOST" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
GHOST_STATUS=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT status FROM devices WHERE id='$GHOST_ID';")
if [ "$GHOST_STATUS" = "down" ]; then
  echo "✖ FALSE ALARM: a brand-new unreachable device was marked 'down' immediately."
  exit 1
fi
echo "  ✔ No false alarm: new unreachable device is '$GHOST_STATUS', not 'down'"

curl -s -o /dev/null -X DELETE "http://localhost:3000/devices/$GHOST_ID"

# Both protocols actually resolved — not just registered.
GRPC_COUNT=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT count(*) FROM devices WHERE protocol='grpc';")
REST_COUNT=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT count(*) FROM devices WHERE protocol='rest';")
echo "  Protocols resolved: $REST_COUNT REST, $GRPC_COUNT gRPC"
if [ "$GRPC_COUNT" -ne 2 ] || [ "$REST_COUNT" -ne 4 ]; then
  echo "✖ Expected 4 REST + 2 gRPC devices with resolved protocols."
  exit 1
fi
echo "  ✔ All 6 devices resolved their protocol correctly"

# Checksum column: must be NULL (honest) — never a fabricated value.
FAKE_CHECKSUMS=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT count(*) FROM diagnostics WHERE checksum IS NOT NULL;")
if [ "$FAKE_CHECKSUMS" -ne 0 ]; then
  echo "  ! $FAKE_CHECKSUMS diagnostics rows have a checksum — expected 0 until the binary exists."
else
  echo "  ✔ Checksums are NULL (honest) — no fabricated values in the database"
fi

echo -e "\n====================================================="
echo " ✔ SUCCESS: Entire Fleet Orchestration Verified!"
echo "====================================================="
echo "You can now view live logs by running:"
echo "  podman logs -f monitoring-service_rest_1"
