-- Migration: add diagnostics.reachable, and clean up the sentinel
-- string ("not reachable") the OLD buggy poller wrote into
-- device_reported_status before this fix.
--
-- Safe to run once against a live database with existing data. Run
-- inside a transaction so it's all-or-nothing.
--
--   podman exec -i unifi-db psql -U poc -d poc < db/postgres/migrate-add-reachable.sql

BEGIN;

-- Temporary default so existing rows don't violate NOT NULL — every
-- pre-existing row was written by code that only ever called
-- recordDiagnostics for either a real successful read OR the buggy
-- "not reachable" sentinel, so "true" is a safe default to start from;
-- the UPDATE below corrects the rows that were actually failures.
ALTER TABLE diagnostics ADD COLUMN reachable boolean NOT NULL DEFAULT true;

-- Rows written by the old bug represented a failed check. Migrate them
-- to the corrected representation: reachable = false, and no
-- fabricated value sitting in device_reported_status (that column is
-- the DEVICE's claim about itself — a failed check has none).
UPDATE diagnostics
SET reachable = false,
    device_reported_status = NULL
WHERE device_reported_status = 'not reachable';

-- Remove the temporary default — every row now has an explicit, correct
-- value, and new rows must always specify one going forward, same as
-- if this column had existed from the start.
ALTER TABLE diagnostics ALTER COLUMN reachable DROP DEFAULT;

COMMIT;
