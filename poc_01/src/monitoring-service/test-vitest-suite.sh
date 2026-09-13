#!/usr/bin/env bash
set -e

# Jump to the directory where the script lives (monitoring-service)
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "====================================================="
echo "  VITEST SUITE: Isolated Integration & Unit Tests"
echo "====================================================="

echo "==> 1. Preparing Isolated Test Database (poc_test)..."
podman exec unifi-db psql -U poc -d postgres -c "DROP DATABASE IF EXISTS poc_test;" >/dev/null
podman exec unifi-db psql -U poc -d postgres -c "CREATE DATABASE poc_test;" >/dev/null

echo "==> 2. Injecting Database Schema..."
# Using ../db because this script lives inside monitoring-service
podman exec -i unifi-db psql -U poc -d poc_test < ../db/postgres/init.sql >/dev/null

echo "==> 3. Executing Vitest Suite Inside Container Network..."
# We run this inside the 'rest' container so it can resolve Docker DNS names
# and safely inject the TEST_DATABASE_URL.
podman exec -it \
  -e TEST_DATABASE_URL="postgres://poc:poc@unifi-db:5432/poc_test" \
  monitoring-service_rest_1 \
  npm run test:fast

echo -e "\n====================================================="
echo " ✔ VITEST SUITE COMPLETED SUCCESSFULLY!"
echo "====================================================="
