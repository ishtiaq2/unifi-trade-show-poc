# Requirements

Source: "URGENT: PoC Needed for Trade Show" email. This document separates
what was **explicitly asked for** from what's **implied but unstated**,
and prioritizes both — because the brief itself says prioritization under
time pressure is part of what's being evaluated, not a side effect of it.

Priority key: **P0** = the thing this PoC is actually for; without it the
exercise has failed. **P1** = expected of competent, professional work.
**P2** = valuable if time allows; explicitly not the point of the exercise.

## Explicit requirements

| # | Requirement | Priority | Note |
|---|---|---|---|
| 1 | Monitor a list of network devices — are they alive | P0 | The core loop |
| 2 | Support REST for retrieving diagnostics (HW/SW/FW version, status, checksum) | P0 | Stated as required |
| 3 | Support gRPC for devices that support it | P1 | Stated as "ideally" — read as a should, not a must |
| 4 | Determine device capabilities/protocol via the device's own health endpoint | P0 | This is the mechanism that makes #2/#3 dynamic instead of hardcoded per device |
| 5 | API to retrieve latest status of all monitored devices | P0 | The actual deliverable a demo would show |
| 6 | Device list changes dynamically, without restarting the service | P0 | Explicit — "we don't want false alarms" elsewhere implies this list also needs to be readable/auditable, not just mutable |
| 7 | Handle a down device "intelligently" — retries and/or logging, candidate decides | P0 | Explicit delegation of a design decision — see `specification.md` for the chosen approach and reasoning |
| 8 | Devices may be behind unstable networks — avoid false alarms | P0 | Directly shapes #7: naive single-timeout-equals-down logic is explicitly called out as wrong |
| 9 | Persist device identity/status in Postgres, inspectable offline | P0 | Explicit, explicit technology choice (not "a database" — Postgres specifically) |
| 10 | Integrate with an external checksum-generator binary for diagnostics data | P1 | Explicitly **not available yet** ("I don't have it, will plug that in later") — this is a request to build an integration *seam*, not a working integration |
| 11 | "Paired with the PoC life-cycle to get valid test results" | P0 (interpretation) | Ambiguous as written — see `assumptions.md` for the interpretation adopted and why |
| 12 | Testing/running the whole thing must be easy, on a variety of unknown hardware/OS at the venue | P0 | Directly implies containerization — "quick and easy" on unknown OS is a portability requirement in disguise |
| 13 | Implement the actual Node.js backend service | P0 | Stated as the deliverable |
| 14 | Provide a short reply to the boss | P0 | Stated as a deliverable — see `reply-to-boss.md` (drafted after the technical scope is locked) |
| 15 | Disclose where/how AI assistance was used | P0 | Grading criterion stated outside the boss-email narrative — goes in `AI_USAGE.md` |

## Implicit requirements ("between the lines")

These aren't quoted anywhere in the email — they're inferred from tone,
context, and what a real trade-show PoC actually needs to not embarrass
the company.

| # | Requirement | Reasoning |
|---|---|---|
| 16 | Clean extension points for gRPC and the checksum binary, without building them fully | The email explicitly says both are coming later ("some devices," "will plug that in later") — the professional move is an interface the future integration slots into, not a half-built implementation of something that doesn't exist yet |
| 17 | No UI is required | The email only ever asks for "an API to retrieve the latest status" — never a dashboard or screen. Building one would be scope creep dressed up as impressiveness, at the expense of the backend engineering the role is actually for |
| 18 | Structured, leveled logging (not console.log scattered around) | "look professional... this might become part of something bigger" — a PoC that becomes a real product needs its operational signals to survive that transition |
| 19 | A device being unreachable is not the same event as a device being confirmed down | Directly follows from "unstable networks... don't want false alarms" — this is a state-machine problem (reachable / suspect / down), not a boolean |
| 20 | Someone other than the author needs to be able to run this in minutes | "must be able to get it up and running quick and easy" + unknown trade-show hardware — this is really a developer-experience requirement, graded as such |
| 21 | The reply to the boss should manage expectations, not just report status | A real engineer receiving this email would flag the ambiguities and scope risks back to the sender, not silently absorb every possible interpretation and hope it matches |

## Explicitly out of scope for this PoC

Stated here deliberately, not left implicit — see `non-goals.md` for the
full reasoning per item:

- A real gRPC client wired to actual hardware (interface + one mock implementation only)
- A working integration with the real checksum binary (interface + stub only — the binary doesn't exist yet)
- Authentication/authorization on the monitoring API
- A frontend/dashboard
- Multi-tenant support, horizontal scaling, or production-grade deployment (Kubernetes, etc.)
- Historical time-series storage of status changes beyond "latest known state" (Postgres holds current state, not a full audit log — flagged as a fast-follow, not built now)
