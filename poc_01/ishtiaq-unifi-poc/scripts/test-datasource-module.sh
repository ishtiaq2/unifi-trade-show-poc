#!/usr/bin/env bash
# scripts/test-datasource-module.sh
#
# Tests datasource-module in isolation: starts ONLY Postgres (nothing
# else in the whole system needs to be running), runs its real
# integration test against it, tears down.
#
# This is deliberately the smallest possible test of this module — if
# this script fails, the problem is in the database layer itself, not
# in the REST API, the devices, or anything wired on top of it.
#
#   ./scripts/test-datasource-module.sh          run and tear down
#   ./scripts/test-datasource-module.sh --keep    run and leave db up

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/lib.sh

KEEP=false
[ "${1:-}" = "--keep" ] && KEEP=true

step "datasource-module — isolated test"

info "Starting Postgres only..."
(cd db && podman-compose up -d)

wait_for "Postgres" 15 1 podman exec unifi-db pg_isready -U poc

info "Installing dependencies..."
(cd monitoring-service/datasource-module && npm install --no-audit --no-fund >/dev/null)

step "Running datasource-module's test suite"
if (cd monitoring-service/datasource-module && npm test); then
  success "datasource-module: all checks passed"
  RESULT=0
else
  echo -e "${RED}    \xe2\x9c\x96 datasource-module: test suite FAILED${NC}"
  RESULT=1
fi

if [ "$KEEP" = false ]; then
  step "Tearing down (pass --keep to leave Postgres running)"
  (cd db && podman-compose down)
else
  info "Leaving Postgres running (--keep). Stop with: cd db && podman-compose down"
fi

exit $RESULT
