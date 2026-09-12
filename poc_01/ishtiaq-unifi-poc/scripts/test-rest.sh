#!/usr/bin/env bash
# scripts/test-rest.sh
#
# Tests the rest module (HTTP API + poller + state machine + device
# clients) against real Postgres and real devices — the level above
# test-datasource-module.sh and test-devices.sh, exercising how they
# work TOGETHER. Starts whatever isn't already running, runs the full
# vitest suite (api, discovery, restDeviceClient, stateMachine, poller
# — 40 tests as of step 7), tears down what it started.
#
#   ./scripts/test-rest.sh          run and tear down
#   ./scripts/test-rest.sh --keep   run and leave everything running

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/lib.sh

KEEP=false
[ "${1:-}" = "--keep" ] && KEEP=true

step "rest — test against real Postgres and real devices"

podman network create unifi-net >/dev/null 2>&1 || true

STARTED_DB=false
if ! podman exec unifi-db pg_isready -U poc >/dev/null 2>&1; then
  info "Postgres not running — starting it..."
  (cd db && podman-compose up -d)
  STARTED_DB=true
fi
wait_for "Postgres" 15 1 podman exec unifi-db pg_isready -U poc

info "Ensuring poc_test database exists with the current schema..."
podman exec unifi-db psql -U poc -lqt | cut -d '|' -f1 | grep -qw poc_test \
  || podman exec unifi-db createdb -U poc poc_test
podman exec -i unifi-db psql -U poc -d poc_test < db/postgres/init.sql >/dev/null 2>&1 || true

STARTED_DEVICES=false
if ! curl -sf http://localhost:4001/health >/dev/null 2>&1; then
  info "Devices not running — starting them..."
  (cd devices && podman-compose up -d --build)
  STARTED_DEVICES=true
fi
wait_for "router device (used by discovery.test.ts)" 15 2 curl -sf http://localhost:4001/health

info "Installing dependencies..."
(cd monitoring-service/rest && npm install --no-audit --no-fund >/dev/null)
(cd monitoring-service/datasource-module && npm install --no-audit --no-fund >/dev/null)
(cd devices && npm install --no-audit --no-fund >/dev/null)

step "Running rest's full test suite (40 tests: api, discovery, restDeviceClient, stateMachine, poller)"
if (cd monitoring-service/rest && TEST_DATABASE_URL="postgres://poc:poc@localhost:5432/poc_test" npm test); then
  success "rest: all tests passed"
  RESULT=0
else
  echo -e "${RED}    \xe2\x9c\x96 rest: test suite FAILED${NC}"
  RESULT=1
fi

if [ "$KEEP" = false ]; then
  step "Tearing down what this script started"
  [ "$STARTED_DEVICES" = true ] && (cd devices && podman-compose down)
  [ "$STARTED_DB" = true ] && (cd db && podman-compose down)
  [ "$STARTED_DEVICES" = false ] && info "Devices were already running before this script — left as-is."
  [ "$STARTED_DB" = false ] && info "Postgres was already running before this script — left as-is."
else
  info "Leaving everything running (--keep)."
fi

exit $RESULT
