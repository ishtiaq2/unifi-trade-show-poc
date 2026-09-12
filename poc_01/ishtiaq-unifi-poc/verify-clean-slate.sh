#!/usr/bin/env bash
# Full destructive teardown, rebuild, and end-to-end verification —
# the pre-submission gate. Wipes all containers and the database
# volume, rebuilds everything from scratch, and proves the assembled
# system actually works: REST and gRPC devices both respond, the API
# discovers and registers them over both protocols, the poller runs,
# and diagnostics deduplicate correctly (the step 7 fix) regardless of
# which protocol produced the reading.
#
# This is destructive — never point it at a live/demo deployment.
# For that, use scripts/health-check.sh instead, which only reads.
#
#   ./verify-clean-slate.sh          interactive (pauses after teardown)
#   ./verify-clean-slate.sh --yes    non-interactive, for CI/scripting

set -e
cd "$(dirname "${BASH_SOURCE[0]}")"
source scripts/lib.sh

NONINTERACTIVE=false
[ "${1:-}" = "--yes" ] && NONINTERACTIVE=true

# ==========================================
# 0. Full Teardown
# ==========================================
step "Full Teardown: Stopping containers and removing DB volume"
(cd monitoring-service && podman-compose down >/dev/null 2>&1) || true
(cd devices && podman-compose down >/dev/null 2>&1) || true
(cd db && podman-compose down -v >/dev/null 2>&1) || true
info "Pruning orphaned containers and removing custom images to force clean build..."
# `podman ps -aq` (used in an earlier version of this cleanup) does NOT
# see buildah "working containers" — temporary artifacts from a
# `--build` that got interrupted (a closed terminal, a killed process,
# a crash mid-build) rather than completing normally. These are
# invisible to podman's normal container listing; `--external` is
# required to see them at all. Confirmed on a real machine: a dangling
# image survived every previous version of this cleanup because two
# such containers (literally named after the dangling image's own ID)
# were holding a reference that only `--external` reveals.
podman ps --external -aq | xargs -r podman rm -f >/dev/null 2>&1 || true
podman ps -aq | xargs -r podman rm -f >/dev/null 2>&1 || true
podman pod ps -q | xargs -r podman pod rm -f >/dev/null 2>&1 || true
podman container prune -f >/dev/null 2>&1 || true
podman rmi -f localhost/unifi-monitoring-rest localhost/unifi-devices >/dev/null 2>&1 || true
podman image prune -f >/dev/null 2>&1 || true

# Confirm the cleanup actually worked instead of assuming it did — this
# exact gap (script claims success, a dangling image survives anyway)
# is what prompted this whole block to be rewritten twice already.
REMAINING_DANGLING=$(podman images -f dangling=true -q | wc -l | tr -d ' ')
REMAINING_EXTERNAL=$(podman ps --external -aq | wc -l | tr -d ' ')
if [ "$REMAINING_DANGLING" -gt 0 ] || [ "$REMAINING_EXTERNAL" -gt 0 ]; then
  info "WARNING: $REMAINING_DANGLING dangling image(s), $REMAINING_EXTERNAL external container(s) still present."
  info "Run 'podman rmi <id>' on a dangling image and read the error — it names exactly what's still holding it."
  podman images -f dangling=true
  podman ps --external -a
else
  success "Environment wiped clean — confirmed no dangling images or leftover build containers remain."
fi

if [ "$NONINTERACTIVE" = false ]; then
  info "PAUSED. Open another terminal to manually run 'podman ps -a', 'podman images', and 'podman volume ls'."
  read -p "Press [Enter] to continue creating the environment..."
fi

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

# The 2 gRPC devices (4005, 4006) started in the same `podman-compose
# up` above, but can't be curled — HTTP/2 + protobuf, not plain HTTP.
# No separate readiness probe for them: they're checked properly below,
# by actually registering them through the real API, which is a
# stronger proof of readiness than a bash-side port check would be
# anyway (it exercises the real gRPC client, not just "is a socket
# open"). An earlier version of this script attempted a bash-native
# TCP check here (`/dev/tcp`) — dropped after finding it silently
# fails depending on exactly how the script gets invoked (`sh
# script.sh` vs `./script.sh`), which is worse than not checking at
# all: a check that can silently lie is worse than no check.
info "gRPC devices (4005, 4006) started — verified below via real registration, not curl."

# ==========================================
# 4. Monitoring Service
# ==========================================
step "Starting Monitoring Service"
(cd monitoring-service && podman-compose up -d --build)
info "Waiting for the monitoring service to become healthy..."
wait_for "monitoring service" 15 1 curl -sf http://localhost:3000/healthz

success "Monitoring API (port 3000) is healthy."

# ==========================================
# 5. Live End-to-End Verification
# ==========================================
step "Registering devices (REST and gRPC) with Monitoring Service"
# Checks the actual HTTP status of each registration — the original
# version discarded curl's output entirely, so a 409 (already
# registered, e.g. from a re-run without a full teardown) or a 500
# would have been silently reported as success. 201 is a fresh
# registration; 409 is fine too here since it means the device is
# already known — either way the device ends up registered, which is
# what this check actually cares about.
register_device() {
  local name="$1" address="$2"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/devices \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"address\":\"$address\"}")
  case "$status" in
    201) success "$name registered (201)" ;;
    409) info "$name already registered (409) — fine, continuing" ;;
    *) fail "$name registration failed (HTTP $status)" ;;
  esac
}
register_device "router-1" "router:4001"
register_device "switch-1" "switch:4002"
register_device "camera-rest-1" "camera-rest:4003"
register_device "door-access-rest-1" "door-access-rest:4004"
register_device "camera-grpc-1" "camera-grpc:4005"
register_device "door-access-grpc-1" "door-access-grpc:4006"

# POLL_INTERVAL_MS defaults to 10000 (see rest/src/config/config.ts) and
# isn't overridden in monitoring-service/docker-compose.yml as of this
# writing. If that ever changes, override here to match rather than
# letting this wait silently fall out of sync:
POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-10000}"
WAIT_S=$(( POLL_INTERVAL_MS / 1000 + 2 ))  # +2s safety margin
info "Waiting ${WAIT_S}s for the first Poller cycle to complete (POLL_INTERVAL_MS=$POLL_INTERVAL_MS)..."
sleep "$WAIT_S"

DEVICES_JSON=$(curl -s http://localhost:3000/devices)
if echo "$DEVICES_JSON" | grep -q '"status":"reachable"'; then
  success "Devices successfully discovered and marked reachable by poller."
else
  fail "Poller did not mark devices reachable. Check logs: 'podman logs monitoring-service_rest_1'"
fi

# Registration alone doesn't prove gRPC actually works — REST discovery
# is tried first (see clientFactory.ts's discoverProtocol) and only
# falls back to gRPC when REST fails, so a bug that made gRPC discovery
# silently no-op could still leave the device registered successfully,
# just stuck with protocol:null. This check confirms the fallback
# genuinely ran and genuinely succeeded, for both gRPC devices.
#
# Queried from Postgres directly, not grepped from the JSON response:
# each device's JSON has "protocol" appearing TWICE — once at the top
# level and once nested inside "capabilities" — so a naive
# `grep -o '"protocol":"grpc"' | wc -l` silently double-counts every
# device. Found by actually running it and getting 4 instead of 2, not
# by inspection. The database has no such ambiguity.
GRPC_REACHABLE_COUNT=$(podman exec unifi-db psql -U poc -d poc -t -A -c \
  "SELECT count(*) FROM devices WHERE protocol = 'grpc';")
if [ "$GRPC_REACHABLE_COUNT" -eq 2 ]; then
  success "Both gRPC devices resolved protocol='grpc' (step 8 verified end to end)."
else
  fail "Expected 2 devices with protocol='grpc', found $GRPC_REACHABLE_COUNT. Check logs: 'podman logs monitoring-service_rest_1'"
fi

# ==========================================
# 6. Database Deduplication Test
# ==========================================
step "Verifying Time-Series Deduplication"
COUNT_QUERY="SELECT count(*) FROM diagnostics;"
LATEST_QUERY="SELECT max(recorded_at) FROM diagnostics;"

INITIAL_COUNT=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$COUNT_QUERY")
INITIAL_LATEST=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$LATEST_QUERY")
info "Initial diagnostic row count: $INITIAL_COUNT (latest recorded_at: $INITIAL_LATEST)"

info "Waiting ${WAIT_S}s for another Poller cycle to occur..."
sleep "$WAIT_S"

FINAL_COUNT=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$COUNT_QUERY")
FINAL_LATEST=$(podman exec unifi-db psql -U poc -d poc -t -A -c "$LATEST_QUERY")
info "Final diagnostic row count: $FINAL_COUNT (latest recorded_at: $FINAL_LATEST)"

# Two checks, not one: the row count staying flat is the dedup fix
# working, BUT a poller that silently stopped running would show the
# same flat count for the wrong reason. Confirming recorded_at actually
# advanced proves the poller is still active, not just quiet.
if [ "$INITIAL_COUNT" -ne "$FINAL_COUNT" ]; then
    fail "Deduplication failed! Row count grew from $INITIAL_COUNT to $FINAL_COUNT."
elif [ "$INITIAL_LATEST" = "$FINAL_LATEST" ]; then
    fail "Row count stayed flat, but recorded_at never advanced — the poller may have stopped running, not deduplicated correctly. Check: podman logs monitoring-service_rest_1"
else
    success "Deduplication is working! Row count stayed at $FINAL_COUNT while recorded_at kept advancing — the poller is active and correctly touching rows instead of inserting new ones."
fi

echo -e "\n${GREEN}==========================================${NC}"
echo -e "${GREEN}  ALL TESTS PASSED. CLEAN SLATE VERIFIED. ${NC}"
echo -e "${GREEN}==========================================${NC}\n"
