#!/usr/bin/env bash
# scripts/health-check.sh
#
# Checks an ALREADY-RUNNING deployment. Read-only — never stops,
# restarts, or rebuilds anything. This is the one to run against the
# actual trade-show setup: the other scripts in this directory tear
# things down and rebuild them, which is exactly what you don't want
# pointed at a system currently being demoed.
#
# Exit code is the real signal for scripting/CI: 0 means healthy, 1
# means something needs attention — the printed output says what.
#
#   ./scripts/health-check.sh
#   ./scripts/health-check.sh --host 192.168.0.45   # check a remote deployment

set -uo pipefail  # NOT -e: a single failed check should be reported, not abort the rest
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/lib.sh

HOST="localhost"
if [ "${1:-}" = "--host" ]; then HOST="$2"; fi

PROBLEMS=0
note_problem() { PROBLEMS=$((PROBLEMS + 1)); }

step "Health check against $HOST — read-only, changes nothing"

# --- Monitoring service -----------------------------------------------
if curl -sf "http://$HOST:3000/healthz" | grep -q '"ok":true'; then
  success "Monitoring service is up (:3000/healthz)"
else
  echo -e "${RED}    \xe2\x9c\x96 Monitoring service did not respond healthy on :3000${NC}"
  note_problem
fi

# --- Devices ------------------------------------------------------------
for port in 4001 4002 4003 4004; do
  if curl -sf "http://$HOST:$port/health" >/dev/null; then
    success "Device on :$port responding"
  else
    echo -e "${RED}    \xe2\x9c\x96 Device on :$port not responding${NC}"
    note_problem
  fi
done
info "gRPC devices (:4005, :4006) can't be curled — check by hand if needed:"
info "  cd devices && npm run grpc-client -- $HOST:4005"

# --- Registered devices and their status --------------------------------
step "Registered devices"
DEVICES_JSON=$(curl -sf "http://$HOST:3000/devices" 2>/dev/null)
if [ -z "$DEVICES_JSON" ]; then
  echo -e "${RED}    \xe2\x9c\x96 Could not fetch /devices${NC}"
  note_problem
else
  COUNT=$(echo "$DEVICES_JSON" | grep -o '"id"' | wc -l | tr -d ' ')
  info "$COUNT device(s) registered"

  DOWN_COUNT=$(echo "$DEVICES_JSON" | grep -o '"status":"down"' | wc -l | tr -d ' ')
  SUSPECT_COUNT=$(echo "$DEVICES_JSON" | grep -o '"status":"suspect"' | wc -l | tr -d ' ')

  if [ "$DOWN_COUNT" -gt 0 ]; then
    echo -e "${RED}    \xe2\x9c\x96 $DOWN_COUNT device(s) currently DOWN${NC}"
    note_problem
  else
    success "No devices currently down"
  fi

  if [ "$SUSPECT_COUNT" -gt 0 ]; then
    info "$SUSPECT_COUNT device(s) currently suspect — worth watching, not necessarily a problem"
    info "(a device briefly showing suspect and clearing on its own is the system working correctly)"
  fi
fi

# --- Poller heartbeat, via container logs (best-effort — only works
#     when checking localhost with podman available) -------------------
if [ "$HOST" = "localhost" ] && command -v podman >/dev/null 2>&1; then
  step "Poller activity (last few minutes of logs)"
  RECENT=$(podman logs --since 3m monitoring-service_rest_1 2>/dev/null | grep -c '"msg":"poll cycle complete"')
  if [ "${RECENT:-0}" -gt 0 ]; then
    success "Poller has completed $RECENT cycle(s) in the last 3 minutes"
  else
    echo -e "${YELLOW}    ! No poll cycles logged in the last 3 minutes — check 'podman logs monitoring-service_rest_1'${NC}"
    note_problem
  fi
fi

echo
if [ "$PROBLEMS" -eq 0 ]; then
  echo -e "${GREEN}==========================================${NC}"
  echo -e "${GREEN}  HEALTHY — no problems found${NC}"
  echo -e "${GREEN}==========================================${NC}"
  exit 0
else
  echo -e "${RED}==========================================${NC}"
  echo -e "${RED}  $PROBLEMS problem(s) found — see above${NC}"
  echo -e "${RED}==========================================${NC}"
  exit 1
fi
