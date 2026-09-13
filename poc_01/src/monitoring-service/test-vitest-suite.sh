#!/usr/bin/env bash
set -e

# Jump to the directory where the script lives
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "====================================================="
echo "  VITEST SUITE: Isolated Sandbox Execution"
echo "====================================================="

echo "==> 1. Shutting down E2E containers to prevent test interference..."
podman-compose down >/dev/null 2>&1 || true
(cd ../devices && podman-compose down >/dev/null 2>&1) || true

echo "==> 2. Preparing Isolated Test Database (poc_test)..."
podman exec unifi-db psql -U poc -d postgres -c "DROP DATABASE IF EXISTS poc_test;" >/dev/null
podman exec unifi-db psql -U poc -d postgres -c "CREATE DATABASE poc_test;" >/dev/null
podman exec -i unifi-db psql -U poc -d poc_test < ../db/postgres/init.sql >/dev/null

echo "==> 3. Running Vitest Suite..."
# - Installs API dependencies
# - Installs Device dependencies (so the mock servers can boot)
# - Creates symlinks so hardcoded test paths find the simulators in their new home
podman run --rm --net=host \
  --userns=keep-id \
  -v "$(pwd)/..":/app:z \
  -w /app/monitoring-service \
  -e TEST_DATABASE_URL="postgres://poc:poc@127.0.0.1:5432/poc_test" \
  node:22-slim \
  bash -c "npm install && \
           cd ../devices && npm install && \
           cd ../monitoring-service && \
           ln -sfn ../devices/01-rest 01-rest && \
           ln -sfn ../devices/02-grpc 02-grpc && \
           npm run test:fast"

echo -e "\n====================================================="
echo " ✔ VITEST SUITE COMPLETED SUCCESSFULLY!"
echo "====================================================="
