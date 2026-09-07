-- Schema for the device monitoring PoC.
-- Applied automatically by docker-compose (mounted into
-- /docker-entrypoint-initdb.d), or manually:
--   psql -d poc -f db/init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

CREATE TABLE devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,

  -- host:port. Protocol-agnostic on purpose: which protocol a device
  -- speaks is discovered from its health endpoint, not encoded here.
  -- UNIQUE so the same device cannot be registered twice, which would
  -- double its poll traffic and show it twice on the demo screen.
  address               text NOT NULL UNIQUE,

  protocol              text CHECK (protocol IN ('rest', 'grpc')),
  capabilities          jsonb,          -- raw discovery response, kept for debugging

  -- This service's derived verdict. NOT the same thing as the device's
  -- own self-reported health, which lives on diagnostics below.
  status                text NOT NULL DEFAULT 'reachable'
                          CHECK (status IN ('reachable', 'suspect', 'down')),

  consecutive_failures  integer NOT NULL DEFAULT 0,
  last_checked_at       timestamptz,
  last_success_at       timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diagnostics (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id               uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  hw_version              text,
  sw_version              text,
  fw_version              text,

  -- The device's OWN claim about itself, distinct from devices.status.
  -- A device can be perfectly reachable while reporting an internal
  -- fault; collapsing these into one column would lose exactly the
  -- information an operator wants. See docs/assumptions.md #8.
  device_reported_status  text,

  -- Null until the external checksum binary is available. Deliberately
  -- null rather than a fabricated value: the brief says this database
  -- gets inspected offline, and a realistic-looking hash that verifies
  -- nothing is worse than an obviously absent one.
  checksum                text,

  recorded_at             timestamptz NOT NULL DEFAULT now()
);

-- Diagnostics are append-only snapshots, and the common read is "latest
-- for this device", so index on that access pattern directly rather than
-- maintaining a separate current-diagnostics table.
CREATE INDEX idx_diagnostics_device_recorded
  ON diagnostics (device_id, recorded_at DESC);

-- Supports "show me everything that isn't healthy", the query a trade
-- show operator actually runs.
CREATE INDEX idx_devices_status ON devices (status);
