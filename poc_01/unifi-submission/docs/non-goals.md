# Non-Goals

Everything here was considered and deliberately excluded. The brief
states that limited time and prioritization are understood — so the
prioritization is made explicit rather than left to look like oversight.

| Excluded | Reasoning |
|---|---|
| **Real gRPC client against physical hardware** | No gRPC device exists in this scenario. Building a "real" client with nothing to validate against risks building the wrong thing confidently. Interface plus mock-verified implementation proves the architecture holds; swapping in a hardware-tested client touches one file. |
| **Working checksum binary integration** | Explicitly unavailable. Guessing its invocation contract would likely need rework the moment it arrives. The seam is the deliverable, per `assumptions.md` #3. |
| **Authentication / authorization** | Not requested. This is an internal demo tool. Time spent here is time not spent on the reliability behavior that *was* explicitly requested. |
| **Frontend / dashboard** | The brief asks for an API and never mentions a screen. A half-finished dashboard would look worse at the booth than a clean API — see `assumptions.md` #7. |
| **Historical status timeline API** | The `diagnostics` table already accumulates snapshots, so the data exists; only the query endpoint is missing. Real design questions (retention, pagination, storage growth) do not belong in a PoC timeline. |
| **Horizontal scaling / Kubernetes / HA Postgres** | This monitors a handful of devices at one venue. A single process is the correct amount of engineering for the stated problem. |
| **Config-file device list with hot reload** | An admin API over the existing database avoids a second source of truth and satisfies "update without restarting" more simply — `assumptions.md` #6. |
| **ORM** | Two tables, a handful of queries. An ORM adds a dependency and a layer of indirection over SQL that is already readable. |
| **Alerting / notifications** | Not requested. The state transitions are logged at appropriate levels, which is the hook a real alerting integration would attach to later. |

## What this buys

Every exclusion above is a **bounded addition**, not a rewrite, because
the architecture was chosen to keep those seams open:

- Two interfaces for the two explicitly-incomplete integrations.
- A data model that separates current state from historical snapshots,
  so history is a query away rather than a migration away.
- Configuration rather than constants for every venue-dependent value.
- A service layer that does not assume single-process forever.

The trade made deliberately: **spend the budget on the core monitoring
loop and its failure behavior, keep every other door open.** That loop is
what the brief actually asks for, and it is what a customer at the booth
will see.
