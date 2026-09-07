# Requirements

Extracted from the "URGENT: PoC Needed for Trade Show" email. The brief
states that part of the evaluation is how well soft implications are
translated, so this document separates what was **stated** from what was
**implied**, and assigns priority to both.

Priority: **P0** = the PoC fails without it. **P1** = expected of
professional work. **P2** = valuable, explicitly not the point.

## Explicit requirements

| # | Requirement | Priority | Status | Where |
|---|---|---|---|---|
| 1 | Check whether a list of network devices is alive | P0 | Done | `src/poller/poller.ts` |
| 2 | REST support for retrieving diagnostics | P0 | Done | `src/clients/RestDeviceClient.ts` |
| 3 | gRPC support ("ideally", "some of our new devices") | P1 | Done, mock-verified | `src/clients/GrpcDeviceClient.ts` |
| 4 | Diagnostics: HW, SW, FW version, status, checksum | P0 | Done — "status" resolved as two distinct fields, see `assumptions.md` #8 | `db/init.sql`, `src/domain/types.ts` |
| 5 | Use the device's health endpoint to discover capabilities | P0 | Done | `src/clients/clientFactory.ts` |
| 6 | API to retrieve latest status of all monitored devices | P0 | Done | `GET /devices` |
| 7 | Device list changes dynamically, without restarting | P0 | Done | `POST`/`DELETE /devices` |
| 8 | Handle a down device "intelligently — maybe retries? maybe logging? you decide" | P0 | Done — both, plus a three-state model | `poller.ts`, `stateMachine.ts` |
| 9 | Unstable networks must not cause false alarms | P0 | Done | `src/domain/stateMachine.ts` |
| 10 | Store device identities and status in Postgres, inspectable offline | P0 | Done | `db/init.sql`, `src/repo/` |
| 11 | Integrate with an external checksum generator binary (not yet available) | P1 | Seam built, stub implementation | `src/checksum/ChecksumProvider.ts` |
| 12 | "Paired with the PoC life-cycle to get valid test results" | P0 | Interpreted — see `assumptions.md` #1 | `test/lifecycle.test.ts` |
| 13 | Testing the whole thing must be easy | P0 | Done — `npm test`, one command | `monitoring-service/test/` |
| 14 | Quick and easy to run, on unknown hardware and operating systems | P0 | Done — `docker compose up` | `docker-compose.yml` |
| 15 | Implement the Node.js backend service | P0 | Done | `monitoring-service/` |
| 16 | Provide a short reply to the boss | P0 | Done | `REPLY_TO_BOSS.md` |
| 17 | Make clear where and why AI assistance was used | P0 | Done | `AI_USAGE.md` |

## Implied requirements ("hidden between the lines")

Not quoted anywhere in the email. Inferred from context, tone, and what a
trade show PoC actually needs in order not to embarrass the company.

| # | Requirement | Where it comes from |
|---|---|---|
| 18 | Build extension *seams* for gRPC and the checksum binary rather than guessed implementations | Both are described as arriving later. Guessing at an interface that does not exist yet produces work that has to be thrown away |
| 19 | No UI is required | The email asks for "an API to retrieve the latest status" and never mentions a screen. "Look professional" is about engineering quality, not pixels — see `assumptions.md` #7 |
| 20 | Structured, leveled logging | "This might become part of something bigger." Free-text `console.log` has to be rewritten when it reaches a real log aggregator; structured JSON survives the transition |
| 21 | "Unreachable" and "confirmed down" are different states | Follows directly from "we don't want false alarms". A boolean cannot express "failing, but not yet trusted to be down" |
| 22 | Someone other than the author must be able to run this in minutes | "Get it up and running quick and easy", plus an unknown host OS at the venue. This is a developer-experience requirement, and the brief says DX is graded |
| 23 | Tunable at the venue without a code change | The network conditions are an unknown. Thresholds are environment config, not constants |
| 24 | The reply should manage expectations, not just report completion | A real engineer receiving this email would flag the ambiguities and the missing binary back to the sender rather than silently absorbing every possible interpretation |
| 25 | Do not double-monitor the same device | Implied by professionalism: a device appearing twice on the demo screen looks broken. Enforced by a UNIQUE constraint and a 409 |

## Out of scope

Deliberate exclusions with reasoning in `non-goals.md`:

- A real gRPC client against physical hardware (mock-verified only)
- A working checksum binary integration (seam + stub only)
- Authentication and authorization
- A frontend or dashboard
- Horizontal scaling, Kubernetes, production deployment topology
- Historical status timeline endpoints (schema supports it; no API yet)
