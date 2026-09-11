-- db/postgres/init.sql

-- Schema for the device monitoring PoC.
--
-- Applied automatically on first start by docker-compose (mounted into
-- /docker-entrypoint-initdb.d/), or manually:
--   psql -d poc -f db/init.sql
--
-- Note: Postgres only runs files in /docker-entrypoint-initdb.d/ when
-- its data directory is EMPTY. After the first `docker compose up`,
-- editing this file has no effect until the volume is removed
-- (`docker compose down -v`). Easy to lose time to.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- provides gen_random_uuid()

CREATE TABLE devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,

  -- "host:port". Deliberately protocol-agnostic: which protocol a
  -- device speaks is discovered from its health endpoint at
  -- registration, not encoded in how it was typed in.
  --
  -- UNIQUE so the same physical device cannot be registered twice,
  -- which would double its poll traffic and show it twice on the demo
  -- screen. Enforced here rather than only in application code, so a
  -- second API instance or a manual INSERT can't bypass it.
  address               text NOT NULL UNIQUE,

  -- NULL until capability discovery succeeds. A device registered
  -- while still booting is legitimate and stays NULL until the poller
  -- resolves it on a later cycle.
  protocol              text CHECK (protocol IN ('rest', 'grpc')),

  -- The raw discovery response, kept verbatim for debugging: when a
  -- device misbehaves, the first question is what it actually claimed
  -- to support.
  capabilities          jsonb,

  -- THIS SERVICE'S verdict about reachability — not the device's own
  -- opinion of itself, which lives on diagnostics.device_reported_status
  -- below. Three states rather than a boolean is what makes it possible
  -- to say "failing, but not yet trusted to be down".
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

  -- ON DELETE CASCADE: removing a device removes its history. The
  -- alternative (orphaned diagnostics rows) would accumulate silently
  -- with no way to interpret them.
  device_id               uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,

  -- Whether THIS SPECIFIC CHECK succeeded. Distinct from devices.status
  -- (the state machine's considered verdict, requiring accumulated
  -- evidence). This is the raw per-check fact, and it's what makes
  -- deduplication possible: comparing (reachable, device_reported_status)
  -- against the latest row tells the poller whether a reading is "the
  -- same kind of result as last time" (touch the timestamp) or "a real
  -- change" (insert a new row, permanently, even across a later
  -- recovery).
  reachable               boolean NOT NULL,

  -- NULL when reachable = false: a failed check has no device data to
  -- report. The row still exists — it marks THAT a failure happened,
  -- even though it can't say what the device's own state was.
  hw_version              text,
  sw_version              text,
  fw_version              text,

  -- The device's OWN claim about itself, distinct from devices.status.
  -- A device can answer every request perfectly while reporting an
  -- internal fault. Collapsing these two into one column would lose
  -- exactly the information an operator wants, unrecoverably.
  --
  -- NEVER a poller-invented value (e.g. NOT "not reachable" when a
  -- check fails) — that would make this column mean two different
  -- things depending on who wrote it, and silently break the
  -- device-vs-service distinction this schema exists to preserve. NULL
  -- when reachable = false, for the same reason as the version columns
  -- above: the device didn't say anything, so nothing is recorded on
  -- its behalf.
  device_reported_status  text,

  -- NULL until the external checksum binary is available. Deliberately
  -- NULL rather than a fabricated value: this database gets inspected
  -- offline, and a realistic-looking hash that verifies nothing is
  -- worse than an obviously absent one.
  checksum                text,

  recorded_at             timestamptz NOT NULL DEFAULT now()
);

-- Diagnostics are append-only snapshots and the dominant read is
-- "latest for this device", so index that access pattern directly
-- rather than maintaining a separate current-diagnostics table.
CREATE INDEX idx_diagnostics_device_recorded
  ON diagnostics (device_id, recorded_at DESC);

-- Supports "show me everything that isn't healthy" — the query an
-- operator actually runs at a trade show.
CREATE INDEX idx_devices_status ON devices (status);
