-- Schema for the device monitoring PoC.
-- Matches poc/docs/specification.md "Data model (Postgres)".

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TABLE devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  address               text NOT NULL,          -- host:port or URL, protocol-agnostic
  protocol              text,                    -- 'rest' | 'grpc', set after capability discovery
  capabilities          jsonb,                   -- raw capability response, for debugging/audit
  status                text NOT NULL DEFAULT 'reachable'
                          CHECK (status IN ('reachable', 'suspect', 'down')),
  consecutive_failures  int NOT NULL DEFAULT 0,
  last_checked_at       timestamptz,
  last_success_at       timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diagnostics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  hw_version    text,
  sw_version    text,
  fw_version    text,
  checksum      text,   -- nullable while ChecksumProvider is stubbed (see docs/assumptions.md #3)
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

-- The monitoring service reads "latest diagnostics per device" far more
-- often than full history, so this index keeps that lookup cheap without
-- needing a separate materialized "current diagnostics" table.
CREATE INDEX idx_diagnostics_device_recorded
  ON diagnostics (device_id, recorded_at DESC);

CREATE INDEX idx_devices_status ON devices (status);
