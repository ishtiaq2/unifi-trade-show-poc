# AI Usage

The assignment requires disclosure of where and how AI assistance was
used. This file is started now, at the design stage, and will be updated
entry-by-entry as implementation proceeds — not written from memory
afterward.

## Design phase (this commit)

- Used AI assistance to structure and draft `docs/requirements.md`,
  `docs/assumptions.md`, `docs/specification.md`, and `docs/non-goals.md`
  from the raw assignment email.
- My own judgment calls, not the AI's: which requirements are P0 vs P1
  vs P2; the specific interpretation of the "PoC life-cycle" line; the
  choice of a three-state (reachable/suspect/down) model over a simpler
  boolean; and the decision to scope out a UI despite "look professional"
  language that could be read either way.
- Reviewed the generated documents against the original email line by
  line to confirm nothing in the brief was dropped and nothing was added
  that wasn't actually asked for or reasonably implied.

## Implementation phase

### Device simulators (`devices/`)

- Used AI assistance to generate the shared REST/gRPC simulator
  implementations and the 6 per-device profiles, from a design already
  decided by hand (which 6 devices, which failure behaviors, why —
  see `devices/README.md`).
- Verified every simulator by actually running it, not by reading the
  code: REST devices tested with curl, gRPC devices tested with a real
  gRPC client, the flaky and goes-down failure modes confirmed by
  hitting them repeatedly and observing the actual response pattern.
- Caught and fixed a real bug this way: `@grpc/grpc-js` was only
  installed under `_shared/node_modules`, but the gRPC device
  entrypoints required it directly — which fails under Node's module
  resolution despite looking correct on inspection. Full writeup in
  `devices/README.md` under "a real bug this surfaced."
- The Postgres schema (`db/init.sql`) was verified against a real
  Postgres 16 instance — table creation, the status CHECK constraint
  actually rejecting invalid values, and default values all confirmed
  by running real inserts, not assumed from reading the SQL.

_(monitoring-service implementation entries to follow once that's built.)_
