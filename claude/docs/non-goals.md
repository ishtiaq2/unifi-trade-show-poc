# Non-Goals (for this PoC)

Every item here was considered and deliberately excluded, not forgotten.
Listed with reasoning because the brief explicitly says prioritization
under time pressure is part of what's being judged.

| Excluded | Why |
|---|---|
| Real gRPC client against actual hardware | No gRPC device exists in this scenario to validate against — building a "real" client with nothing to test it on risks building the wrong thing confidently. The interface + a mock server is enough to prove the architecture holds. |
| Real checksum binary integration | Explicitly stated as not available yet. Building against a guess of its interface would likely need rework the moment the real binary shows up — the seam matters more than a guessed implementation. |
| Authentication/authorization | Not requested; this is an internal trade-show tool, not a public API. Time is better spent on the reliability behavior that's explicitly requested. |
| Historical time-series of status changes | "Inspectable offline" is satisfied by current-state + diagnostics snapshots in Postgres. Full history is a real feature with real design questions (retention, storage growth) that don't belong in a PoC timeline — flagged as an easy fast-follow given the schema already separates diagnostics from device state. |
| A UI/dashboard | Never requested — the brief asks for an API. Building one would spend PoC time on something outside what was actually asked for, however tempting "make it look impressive" makes it. |
| Horizontal scaling / production deployment topology | This is a trade-show PoC monitoring a handful of devices, not a fleet at production scale. A single-process service is the right amount of engineering for the stated problem. |
| Config-file-based device list with hot-reload/file-watching | An admin API backed by the same database avoids a second source of truth, and satisfies "update dynamically without restarting" more simply than file-watching would. |

## What this buys

Every one of these, if it turns out to matter more than assumed, is a
bounded addition rather than a rewrite — because the architecture in
`specification.md` was chosen specifically to keep these seams open
(interfaces for the two explicitly-incomplete integrations, a data model
that doesn't foreclose history, a service layer that doesn't assume
single-process forever). That tradeoff — spend the time budget on the
core loop and its reliability, keep the door open on everything else —
is the actual prioritization call this document is making explicit.
