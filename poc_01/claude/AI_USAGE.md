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

### monitoring-service implementation

- Used AI assistance to generate the initial implementation of each
  module (state machine, DeviceClient implementations, repository,
  poller, HTTP layer) against the architecture already fixed in
  `docs/specification.md` — the module boundaries and interfaces were
  decided before any code was generated, not discovered by the AI.
- Reviewed and changed AI-suggested output in several concrete places:
  - The default logger initially used plain `console.log(msg, meta)`,
    which prints Node's `util.inspect` format, not JSON — caught because
    the life-cycle test needed to parse real log output and the format
    didn't match what `specification.md` called for ("structured (JSON)
    logging"). Changed to explicit `JSON.stringify`.
  - The build configuration initially reused the same `tsconfig.json` for
    both typecheck and production build, which put compiled output under
    `dist/src/...` instead of `dist/...` — wrong for a Docker `CMD
    ["node", "dist/index.js"]`. Caught by actually running the compiled
    output, not by reading the config. Fixed with a dedicated
    `tsconfig.build.json`.
  - The build also didn't copy `device.proto` into `dist/`, since `tsc`
    only compiles `.ts` files — caught the same way, by running
    `node dist/index.js` and hitting a real `ENOENT`. Fixed by adding an
    explicit copy step to the `build` script itself, not just the
    Dockerfile, so the bug can't resurface for anyone running `npm run
    build` outside Docker.
- Verified everything by actually running it, not by reading the code:
  - All 16 tests pass, including a life-cycle test that boots the real
    entrypoint against real Postgres and a real device simulator.
  - Caught a genuinely flaky test this way: the life-cycle test's
    original method of watching for the `suspect` state (polling the API
    on a timer) could race past the transition under load. This wasn't a
    state-machine bug — the isolated unit tests already proved the state
    machine can't skip `suspect` — it was a flaw in how the test
    observed the system. Fixed by asserting against the poller's own
    structured transition logs instead of a polling race. Full reasoning
    in `monitoring-service/README.md` and inline in the test file.
  - Ran a full manual demo: started Postgres, all 6 real device
    simulators, and the real service; registered all 6 devices through
    the actual `POST /devices` endpoint (one hit the "register succeeds
    even if discovery fails" resilience path for real, unprompted, when
    the flaky camera happened to fail its first health check); then
    watched a device transition `reachable → suspect → down` in real
    time with timing matching the configured threshold, confirmed via
    both the API and the structured log output.
