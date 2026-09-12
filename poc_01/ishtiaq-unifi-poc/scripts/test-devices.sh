#!/usr/bin/env bash
# scripts/test-devices.sh
#
# Tests the device simulators in isolation — no database, no
# monitoring service, nothing else needs to be running. Starts all 6,
# confirms the 4 REST devices respond, and tells you how to check the
# 2 gRPC devices by hand (they can't be curled — see devices/README.md
# for why).
#
#   ./scripts/test-devices.sh          run and tear down
#   ./scripts/test-devices.sh --keep   run and leave devices running

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/lib.sh

KEEP=false
[ "${1:-}" = "--keep" ] && KEEP=true

step "devices — isolated test"

podman network create unifi-net >/dev/null 2>&1 || true

info "Building and starting all 6 device simulators..."
(cd devices && podman-compose up -d --build)

RESULT=0
for port in 4001 4002 4003 4004; do
  if wait_for "REST device on :$port" 15 2 curl -sf "http://localhost:$port/health"; then
    :
  else
    RESULT=1
  fi
done

if [ "$RESULT" -eq 0 ]; then
  success "All 4 REST devices responded"
else
  echo -e "${RED}    \xe2\x9c\x96 One or more REST devices failed to respond${NC}"
fi

step "gRPC devices (cannot be curled — HTTP/2 + protobuf, not plain HTTP)"
info "Check them by hand:"
info "  cd devices && npm run grpc-client -- localhost:4005"
info "  cd devices && npm run grpc-client -- localhost:4006"

if [ "$KEEP" = false ]; then
  step "Tearing down (pass --keep to leave devices running)"
  (cd devices && podman-compose down)
else
  info "Leaving devices running (--keep). Stop with: cd devices && podman-compose down"
fi

exit $RESULT
