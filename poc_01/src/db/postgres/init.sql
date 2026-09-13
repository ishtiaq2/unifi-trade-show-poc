-- unifi-products-demo/src/db/postgres/init.sql
-- Schema for the device monitoring PoC.
--
-- Applied automatically on first start by docker-compose (mounted into
-- /docker-entrypoint-initdb.d/), or manually:
--   psql -d poc -f db/init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- provides gen_random_uuid()

CREATE TABLE devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  address               text NOT NULL UNIQUE,
  protocol              text CHECK (protocol IN ('rest', 'grpc')),
  capabilities          jsonb,
  status                text NOT NULL DEFAULT 'reachable'
                          CHECK (status IN ('reachable', 'suspect', 'down')),

  consecutive_failures  integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_checked_at       timestamptz,
  last_success_at       timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diagnostics (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id               uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  reachable               boolean NOT NULL,
  hw_version              text,
  sw_version              text,
  fw_version              text,
  device_reported_status  text,
  checksum                text,
  recorded_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_diagnostics_device_recorded
  ON diagnostics (device_id, recorded_at DESC);

CREATE INDEX idx_devices_status ON devices (status);
