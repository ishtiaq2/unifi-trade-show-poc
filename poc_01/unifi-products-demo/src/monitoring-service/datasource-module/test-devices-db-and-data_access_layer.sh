#!/usr/bin/env bash
set -e

# Ensure we always execute from the directory where the script lives
# Target location: src/monitoring-service/datasource-module/
cd "$(dirname "${BASH_SOURCE[0]}")"
BASE_DIR=$(pwd)

echo "====================================================="
echo "  Testing Foundational Layers (DB + Devices + DAL)"
echo "====================================================="

# ---------------------------------------------------------
# 1. DATABASE LAYER (../../db)
# ---------------------------------------------------------
echo -e "\n==> 1. Starting PostgreSQL and Verifying Schema..."
cd ../../db
podman-compose down -v >/dev/null 2>&1 || true
podman-compose up -d

echo "Waiting for PostgreSQL to accept connections..."
for i in {1..15}; do
  if podman exec unifi-db pg_isready -U poc >/dev/null 2>&1; then
    echo "✔ PostgreSQL is ready!"
    break
  fi
  sleep 1
  if [ "$i" -eq 15 ]; then
    echo "✖ Database failed to start."
    exit 1
  fi
done

sleep 3 # Give init.sql time to run
echo "Running Database Schema Verification (verify.sh)..."
./postgres/verify.sh
cd "$BASE_DIR"

# ---------------------------------------------------------
# 2. DEVICES LAYER (../../devices)
# ---------------------------------------------------------
echo -e "\n==> 2. Building and Starting Device Simulators..."
cd ../../devices
podman-compose down -v >/dev/null 2>&1 || true
podman-compose up -d --build

echo "Waiting for REST devices to boot..."
for port in 4001 4002 4003 4004; do
  for i in {1..15}; do
    if curl -s http://localhost:$port/health | grep -q '"protocol"'; then
      echo "✔ REST device on port $port is healthy."
      break
    fi
    sleep 2
    if [ "$i" -eq 15 ]; then
      echo "✖ REST device on port $port failed to boot."
      exit 1
    fi
  done
done
echo "✔ All Devices (REST & gRPC) are successfully running!"
cd "$BASE_DIR"

# ---------------------------------------------------------
# 3. DATASOURCE LAYER (current directory)
# ---------------------------------------------------------
echo -e "\n==> 3. Testing Data Access Layer (SQL Service)..."
npm install --no-fund --no-audit
npm test

# ---------------------------------------------------------
# 4. TEARDOWN
# ---------------------------------------------------------
echo -e "\n==> 4. Tearing Down Environment..."
(cd ../../db && podman-compose down -v >/dev/null 2>&1)
(cd ../../devices && podman-compose down -v >/dev/null 2>&1)

echo -e "\n====================================================="
echo " ✔ SUCCESS: Database, Devices, and Datasource verified!"
echo "====================================================="
