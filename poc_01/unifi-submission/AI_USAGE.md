# AI Usage

The assignment requires it to be made clear where and for what purpose AI
assistance was used. This is that record.

## Summary

AI assistance was used throughout implementation, against a design fixed
by hand first. The division of labour was:

- **Mine:** interpreting the brief, deciding what the requirements
  actually are, the architecture and its seams, every judgment call
  recorded in `docs/assumptions.md`, and the decision about what to
  leave out.
- **AI-assisted:** writing code against that design, drafting
  documentation, and generating test scaffolding.
- **Mine again, and the part that mattered most:** verifying by running
  things. Every bug listed below was found by executing code, not by
  re-reading it.

## Design phase

The requirements, assumptions, specification and non-goals documents were
drafted with AI assistance from the raw brief. The judgment calls in them
are mine — which requirements are P0 versus P1, the reading of the "PoC
life-cycle" line, choosing a three-state model over a boolean, and
scoping out a UI despite "look professional" being readable either way.

Each document was checked line by line against the original email to
confirm nothing was dropped and nothing was invented that the brief
neither states nor implies.

## Implementation phase

AI assistance generated initial implementations of each module against
the already-fixed architecture. Where I reviewed and changed the output:

- **Permission-style logic centralisation.** An early version scattered
  checks across route handlers; I moved them behind single chokepoints
  so there is one place to get it right.
- **Logger format.** The default logger initially used
  `console.log(msg, meta)`, which emits Node's `util.inspect` format
  rather than JSON. The specification calls for structured logs, and the
  life-cycle test needs to parse them. Replaced with explicit
  `JSON.stringify`.
- **Checksum stub behavior.** Changed to return `null` rather than a
  deterministic fake. The brief says the database is inspected offline,
  and a plausible-looking hash that verifies nothing is worse than an
  absent one.
- **The `status` requirement.** The brief lists "status" among five
  diagnostics fields. An early implementation stored only the derived
  reachability state. A line-by-line requirements re-read caught this;
  `device_reported_status` was added as its own column, threaded through
  both protocol clients, and covered by a test asserting the two are
  independent. Notably **no existing test could have caught this** —
  the tests only asserted what had already been built.

## Bugs found by running the code

These are listed because they are the clearest evidence of where human
verification added value over generated code that looked correct.

| Bug | How it was found | Why reading wouldn't catch it |
|---|---|---|
| **TypeScript 7 / ts-node incompatibility** — `npm install` pulled TS 7.0.2; ts-node 10.9.2 crashes against it and the service would not boot at all | Running `ts-node src/index.ts` | Both versions are individually valid; only their combination fails |
| **`moduleResolution: "node"` removed in TS 7** | `tsc --noEmit` | Valid in every prior version |
| **Flaky integration tests from port reuse** — `npx ts-node` spawns a grandchild that survives `kill()` on the direct child, so simulators leaked between tests and held ports. Two tests failed in ways that looked like protocol bugs | Running the suite as a whole rather than file by file | Each test is correct in isolation; the interaction is the defect |
| **Flaky life-cycle assertion** — polling the API on a timer could sample straight past the brief `suspect` window | Running the full suite repeatedly | The system was correct; the *test's observation method* raced it. Fixed by asserting on emitted transition logs |
| **Cross-suite database interference** — Vitest runs files in parallel; one suite's `TRUNCATE` deleted rows another had just registered | Running the full suite, not individual files | Each suite passes alone. Only the combination fails |
| **Non-deterministic device fixture** — the readiness probe and capability discovery consumed requests from the simulator's `goes-down` counter, so the device's remaining life varied per run | Running the suite five times and seeing three different wrong values | Looks correct in isolation; the coupling between probe and fixture is invisible in either file |
| **Compounding failure rate in the flaky simulator** — the monitoring service calls two endpoints per check, each rolling failure independently, so a "35%" device fails 58% of checks. Simulation showed ~5 false `down` transitions across a two-hour demo — precisely the false alarm the brief warns against | Writing a Monte Carlo simulation of the two components interacting | Requires reasoning across two components, not reading either one |
| **Module resolution across sibling folders** — `node_modules` under `_shared/` meant gRPC entrypoints failed with `MODULE_NOT_FOUND` | Running each device individually | Node resolves from the requiring file's directory, not the caller's |
| **Build output path and missing proto** — `tsc` with the wrong `rootDir` put `dist/src/index.js` where Docker expected `dist/index.js`, and `tsc` does not copy `.proto` files | Running `node dist/index.js` after `npm run build` | The build reported success both times |

## Verification performed

- 26 automated tests across four suites, all passing.
- Production build compiled and the compiled output executed.
- Full manual demo: real Postgres, all six real simulators, real service,
  all six devices registered through the real API with correct protocol
  auto-discovery (4 REST, 2 gRPC).

## Not verified

Stated plainly rather than left to be assumed:

- **The Docker and podman builds have not been executed.** The
  development environment had no access to a container registry. The
  Dockerfiles and compose file follow standard patterns and the compiled
  build they run was verified directly, but `docker compose up` itself
  should be confirmed before relying on it at the venue.

## Devices phase (TypeScript conversion, podman workflow, gRPC deep-dive)

- The mock device simulators were separately converted from JavaScript
  to TypeScript with AI assistance. Verified by actually running each
  device (REST via curl, gRPC via a real client) after conversion, not
  by reading the diff.
- Two real bugs found this way, not by inspection: stale `.js` files
  left over from the JS→TS conversion were silently shadowing their
  `.ts` replacements at runtime (Node resolves `.js` before `.ts` for an
  extensionless `require`, confirmed by loading the module directly with
  no `ts-node` involved) — every edit to the TypeScript gRPC simulator
  had been running against old code until this was found and the stale
  files deleted. Separately, `npm install` resolving TypeScript 7
  against `ts-node` 10.9.2 crashed the service outright — the same
  incompatibility as the monitoring-service build, found independently
  here and fixed the same way (pin TypeScript to `^5.9.x`).
- A Monte Carlo simulation (not guesswork) of the interaction between
  `camera-rest`'s flaky failure mode and the monitoring service's
  two-request-per-check pattern showed the originally-chosen 0.35
  failure rate compounds to a 58% effective check-failure rate,
  producing roughly 5 false `down` transitions across a simulated
  two-hour demo. Lowered to 0.15 as a result — the exact false alarm the
  brief warns against, caught before it could happen at a real demo.
- `podman-compose` support (install steps, `docker-compose.yml` for the
  devices folder, and the combined root one) was verified by actually
  installing `podman-compose` via pip, parsing both compose files with
  its own `config` command, and confirming the shared-`image:` tag
  pattern produces exactly one `build:` entry across all six device
  services.
