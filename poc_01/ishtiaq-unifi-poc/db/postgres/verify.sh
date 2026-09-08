#!/usr/bin/env bash
#
# Verifies the schema is correctly applied and its constraints actually
# fire. Run after `docker compose up db`:
#
#     ./db/verify.sh
#
# Checks behavior, not just that tables exist — a schema whose
# constraints silently don't fire looks identical to one that works,
# until bad data is already in the database.

set -uo pipefail

PSQL="${PSQL:-psql}"
export PGPASSWORD="${PGPASSWORD:-poc}"
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-poc}"
DB_NAME="${DB_NAME:-poc}"

q() { $PSQL -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>&1; }

# Runs a statement and reports whether the DATABASE rejected it, using
# psql's exit status rather than grepping output. ON_ERROR_STOP makes
# psql exit non-zero on a SQL error; without it psql exits 0 even when
# the statement failed, which silently turns every rejection test into
# a false pass.
try_sql() {
  $PSQL -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>&1
}

# Always clean up test rows, even if the script exits early — otherwise
# leftovers from a failed run make the NEXT run's duplicate-rejection
# test lie.
cleanup() {
  $PSQL -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -q \
    -c "DELETE FROM devices WHERE address LIKE 'verify:%';" >/dev/null 2>&1
}
trap cleanup EXIT

pass=0
fail=0

ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }

# Expect a statement to be REJECTED by the database.
expect_rejected() {
  local desc="$1" sql="$2"
  if try_sql "$sql"; then
    bad "$desc (was ACCEPTED — constraint not working)"
  else
    ok "$desc"
  fi
}

# Expect a statement to succeed.
expect_ok() {
  local desc="$1" sql="$2"
  if try_sql "$sql"; then ok "$desc"; else bad "$desc"; fi
}

echo "Verifying schema on $DB_HOST/$DB_NAME"
echo

echo "Structure:"
for t in devices diagnostics; do
  if [ "$(q "SELECT to_regclass('public.$t') IS NOT NULL;")" = "t" ]; then
    ok "table '$t' exists"
  else
    bad "table '$t' MISSING"
  fi
done
for i in idx_devices_status idx_diagnostics_device_recorded; do
  if [ "$(q "SELECT count(*) FROM pg_indexes WHERE indexname='$i';")" = "1" ]; then
    ok "index '$i' exists"
  else
    bad "index '$i' MISSING"
  fi
done

echo
echo "Constraints (each of these MUST be rejected):"
expect_ok       "valid device is accepted" \
                "INSERT INTO devices (name,address) VALUES ('verify-1','verify:1');"
expect_rejected "duplicate address rejected" \
                "INSERT INTO devices (name,address) VALUES ('verify-dup','verify:1');"
expect_rejected "invalid status rejected" \
                "INSERT INTO devices (name,address,status) VALUES ('v','verify:2','exploded');"
expect_rejected "invalid protocol rejected" \
                "INSERT INTO devices (name,address,protocol) VALUES ('v','verify:3','carrier-pigeon');"
expect_rejected "negative failure count rejected" \
                "INSERT INTO devices (name,address,consecutive_failures) VALUES ('v','verify:4',-1);"
expect_rejected "diagnostics for unknown device rejected" \
                "INSERT INTO diagnostics (device_id,hw_version) VALUES ('00000000-0000-0000-0000-000000000000','ghost');"

echo
echo "Defaults and behavior:"
# LIMIT 1 throughout: if a broken schema allowed the duplicate above,
# these would otherwise return two rows and garble the comparison.
status=$(q "SELECT status FROM devices WHERE address='verify:1' LIMIT 1;")
failures=$(q "SELECT consecutive_failures FROM devices WHERE address='verify:1' LIMIT 1;")
proto_null=$(q "SELECT protocol IS NULL FROM devices WHERE address='verify:1' LIMIT 1;")
if [ "$status" = "reachable" ] && [ "$failures" = "0" ] && [ "$proto_null" = "t" ]; then
  ok "new device defaults to reachable / 0 failures / null protocol"
else
  bad "unexpected defaults: status=$status failures=$failures protocol_is_null=$proto_null"
fi

q "INSERT INTO diagnostics (device_id,hw_version,device_reported_status)
   SELECT id,'HW-1','degraded' FROM devices WHERE address='verify:1' LIMIT 1;" >/dev/null
checksum_null=$(q "SELECT checksum IS NULL FROM diagnostics
                   WHERE device_id=(SELECT id FROM devices WHERE address='verify:1' LIMIT 1);")
[ "$checksum_null" = "t" ] && ok "checksum defaults to NULL (not a fabricated value)" \
                            || bad "checksum was not NULL"

before=$(q "SELECT count(*) FROM diagnostics WHERE device_id=(SELECT id FROM devices WHERE address='verify:1' LIMIT 1);")
q "DELETE FROM devices WHERE address='verify:1';" >/dev/null
after=$(q "SELECT count(*) FROM diagnostics d
           WHERE NOT EXISTS (SELECT 1 FROM devices dv WHERE dv.id=d.device_id);")
if [ "$before" -gt 0 ] && [ "$after" = "0" ]; then
  ok "deleting a device cascades to its diagnostics (no orphans)"
else
  bad "cascade delete left $after orphaned diagnostics rows"
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
