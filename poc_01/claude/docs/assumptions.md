# Assumptions & Interpretations

The brief rewards making interpretations explicit rather than silently
picking one and hoping it's right. Every non-obvious call is logged here
with its reasoning, so a reviewer (or a future engineer) can see the
judgment being applied and challenge it if it's wrong — rather than
reverse-engineering intent from the code.

## 1. "Paired with the PoC life-cycle to get valid test results"

This is the single most ambiguous line in the brief. Read literally it
doesn't fully parse — there's no prior mention of "the PoC life-cycle" as
a defined thing.

**Interpretation adopted:** tests are only considered valid if they
exercise the service through its *real* startup and shutdown sequence —
config load → DB connection → device registry hydration → poller start →
(demo runs) → graceful shutdown — rather than only unit-testing isolated
functions with everything mocked out. In other words: at least one test
suite boots the actual application entrypoint against a real (or
containerized) Postgres, not a hand-wired fake, and tears it down
cleanly. "Valid results" is read as "results from a life-cycle that
resembles the real one," not "results from mocks that assume the
implementation is correct."

**Why this reading over others considered:**
- An alternative reading — "there's a separate existing 'PoC life-cycle'
  process at the company this needs to plug into" — isn't actionable
  without information nobody has provided, and would require asking a
  clarifying question the brief's framing (time-zone gap, "I trust
  you'll make something great") suggests isn't realistically available
  mid-task.
- This reading is also simply good practice for a service that's about
  to be demoed live on unfamiliar hardware: if it only works when
  every dependency is mocked, nobody would find out until it's on stage.

**If this is wrong:** flagged explicitly in `reply-to-boss.md` as
something worth a 30-second confirmation, rather than staying silent
about the ambiguity.

## 2. gRPC scope

The email says gRPC support is wanted for devices that support it
("ideally," "some of our new devices") — not that every device needs it,
and no gRPC devices exist to test against yet in this scenario.

**Interpretation:** build the protocol layer as an interface
(`DeviceClient`) with a working REST implementation and a gRPC
implementation stubbed enough to prove the abstraction holds (e.g.
against a small local mock gRPC server), rather than either skipping
gRPC entirely or building a full production gRPC client with no real
device to validate it against.

## 3. Checksum binary integration

Explicitly stated as not available yet ("I don't have it, will plug that
in later").

**Interpretation:** define a `ChecksumProvider` interface with one
implementation that's clearly a placeholder (e.g. returns a deterministic
stub value and logs that it's a stand-in), so the real binary is a
drop-in replacement later with no changes to calling code. Building a
"real" integration against a binary that doesn't exist would be
building against a guess.

## 4. What counts as "down" vs. a false alarm

**Interpretation:** three states, not two — `reachable`, `suspect`
(one or more recent failures, within retry budget), and `down` (failures
exceeded a threshold across a time window). A device only flips to `down`
after repeated failures with backoff, not on the first missed check. The
specific threshold and backoff curve are a starting default, explicitly
called out in `specification.md` as a config value, not a hardcoded
constant — because the "right" number depends on network conditions
nobody described.

## 5. No authentication on the monitoring API

Not mentioned anywhere in the brief, and this is an internal trade-show
PoC, not a public product. Building auth would be solving a problem that
doesn't exist yet at the cost of time that clearly matters more
elsewhere. Flagged as a fast-follow in `non-goals.md`.

## 6. Device configuration format

The brief doesn't say how the device list is provided or how it's
updated "without restarting." **Interpretation:** an admin endpoint
(`POST/DELETE /devices`) backed by the same Postgres store the status
data lives in, rather than a config file that needs a file-watcher — this
keeps "the device list" and "the device list's history" in one place, and
avoids inventing a second source of truth for something that's
fundamentally the same data the API already needs to serve.

## 7. "Look professional" does not mean "build a UI"

Covered in `requirements.md` #17 — logged here too because it's the
assumption most likely to be second-guessed. The call: professionalism
here means solid API design, structured errors, good logs, and
documentation — not a visual layer nobody explicitly asked for.

## 8. "Status" in "diagnostics data (HW, SW, FW version, status, checksum)"

The brief lists "status" as one of five diagnostics fields to retrieve.
This service captures HW/SW/FW version and checksum per diagnostics
snapshot, but does **not** store a device-self-reported "status" string
alongside them — only the monitoring service's own derived
`reachable`/`suspect`/`down` state on the device row.

**Interpretation:** the derived reachability state *is* "status" in the
sense that matters for this PoC — it's what an operator actually needs
("is this thing working"), and it's already exposed on every device via
`GET /devices`. The mock devices' own `/diagnostics` endpoint does return
a `status` field, but it's a static "ok" with no real signal behind it
(these are simulators, not real firmware reporting real self-diagnostic
state), so persisting it alongside real diagnostics would record a
constant that adds no information.

**Flagged honestly, not silently decided:** this interpretation was
reached during implementation, not at design time — unlike the other
entries in this document, it wasn't written down until an explicit
requirements re-check surfaced it. If real hardware reports a
meaningful self-diagnostic status distinct from reachability (e.g. "ok"
vs "degraded — sensor fault" vs "ok — but overheating"), that's a real
field this schema is currently missing, and the fix is small: add a
`status` column to `diagnostics` and thread it through both
`DeviceClient` implementations the same way `checksum` already flows
from `ChecksumProvider`.
