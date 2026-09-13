#!/usr/bin/env bash
set -e

# Ensure we are executing from the rest directory regardless of where the script is called from
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Rebuilding test database (poc_test)..."
# Drop the DB if it already exists so the test run is fully idempotent
podman exec unifi-db dropdb -U poc --if-exists poc_test 2>/dev/null || true
podman exec unifi-db createdb -U poc poc_test

# Seed the fresh database with your schema
# -q suppresses the wall of "CREATE TABLE" output to keep the terminal clean
podman exec -i unifi-db psql -U poc -d poc_test -q < ../../db/postgres/init.sql
echo "✔ Test database ready."

echo "==> Running test suite..."
export TEST_DATABASE_URL="postgres://poc:poc@localhost:5432/poc_test"
npx vitest run --no-file-parallelism
