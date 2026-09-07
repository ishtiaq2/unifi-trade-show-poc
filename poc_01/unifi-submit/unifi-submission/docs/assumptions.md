# Assumptions & Interpretations

The brief says explicitly that the evaluation covers "how well you
translate soft implications and assumptions." Every non-obvious judgment
call is therefore recorded here with its reasoning, so a reviewer can
disagree with the decision rather than reverse-engineer it from code.

---

## 1. "It must be paired with the PoC life-cycle to get valid test results"

The most ambiguous line in the brief. Read literally it does not fully
parse — "the PoC life-cycle" is never defined anywhere prior.

**Interpretation adopted:** tests only count as valid if they exercise
the service through its *real* life-cycle — config load, database
connection, poller start, HTTP listen, and graceful shutdown — rather
than testing isolated functions with every dependency mocked out.

Concretely, `test/lifecycle.test.ts` spawns the actual `src/index.ts` as
a subprocess against a real Postgres and a real device simulator, drives
a device from healthy to dead, and shuts down through the real SIGTERM
handler.

**Why this reading:**
- The alternative reading — that some pre-existing company process
  called "the PoC life-cycle" must be integrated with — is not
  actionable without information nobody has provided, and the brief's
  framing (time-zone gap, "I trust you'll make something great")
  signals that clarification mid-task is not realistically available.
- Independently, it is simply the right thing for software about to be
  demoed on unfamiliar hardware. A service that only works when its
  dependencies are mocked will reveal that on the show floor.

**Flagged rather than assumed silently:** this interpretation is raised
explicitly in `REPLY_TO_BOSS.md` as something worth thirty seconds of
confirmation.

---

## 2. gRPC scope

The brief says gRPC is wanted "ideally", for "some of our new devices".
No gRPC hardware exists in this scenario.

**Interpretation:** build the protocol layer as a `DeviceClient`
interface with a complete REST implementation and a gRPC implementation
verified against a local mock gRPC server — rather than either skipping
gRPC or building a production gRPC client with nothing real to validate
it against.

The interface is what makes shipping an honestly-incomplete
implementation safe: nothing above it depends on how complete it is.

---

## 3. The checksum binary

Explicitly unavailable: "I don't have it yet, so just focus on preparing
the full PoC, will plug that in later."

**Interpretation:** the deliverable is the integration *seam*, not the
integration. `ChecksumProvider` is an interface with one stub
implementation; the real binary becomes a drop-in change to exactly one
file.

The stub returns `null`, never a plausible-looking fake. The brief says
the database gets inspected offline, and a realistic-looking hash that
verifies nothing is worse than an obviously absent one — it could be
mistaken for genuine integrity data.

---

## 4. What separates "down" from a false alarm

**Interpretation:** three states, not two.

- `reachable` — last check succeeded
- `suspect` — one or more recent failures, below threshold
- `down` — failures reached the configured threshold

A single failure never produces `down`. Any single success returns a
device to `reachable` immediately, from any state.

**That asymmetry is deliberate.** Falsely reporting a healthy device as
down in front of a customer is far more costly than briefly continuing
to show a recovered device as suspect. Failure is treated as a claim
requiring evidence; recovery is trusted on sight.

Threshold, poll interval and backoff are **configuration**, not
constants — the venue's network is an unknown and must be tunable
without a redeploy.

---

## 5. No authentication on the monitoring API

Not mentioned in the brief. This is an internal demo tool, not a public
product. Building auth would spend the time budget on a problem that
does not exist yet, at the cost of the reliability behavior that was
explicitly requested. Listed in `non-goals.md` as a fast-follow.

---

## 6. How the device list is managed

The brief requires updates "without restarting" but does not say how.

**Interpretation:** an admin API (`POST` / `DELETE /devices`) backed by
the same Postgres the status API reads from — rather than a config file
with a filesystem watcher.

This keeps exactly one source of truth. A config file would introduce a
second one, and require reconciling it against the database on every
change.

---

## 7. "Look professional" does not mean "build a UI"

The email asks for "an API to retrieve the latest status" and never
mentions a screen.

**Interpretation:** professionalism here means coherent API design,
structured errors, useful logs, real tests and documentation — not a
visual layer nobody requested. A half-finished dashboard built in the
remaining time would look *worse* at the booth than a clean API with a
`curl` example.

This is the assumption most likely to be challenged, which is why it is
recorded rather than left implicit.

---

## 8. "Status" in "diagnostics data (HW, SW, FW version, status, checksum)"

Two different things could be meant. Both are stored, separately:

- `devices.status` — this service's **derived** reachability verdict
  (`reachable` / `suspect` / `down`)
- `diagnostics.device_reported_status` — what the device says about
  **itself**

**Why both:** a device can answer every request perfectly while
reporting an internal fault. Collapsing these into one field loses
exactly the information an operator wants at a trade show, and it cannot
be recovered afterwards from stored data.

The `switch-1` simulator demonstrates this deliberately: always
reachable, always self-reporting `degraded`.

Devices that report nothing yield `null` rather than a fabricated
default. The gRPC path normalises proto3's empty-string default to
`null`, so both protocols store the same value for "not reported".

**Process note:** an earlier revision of this document argued that
derived reachability alone satisfied the requirement. That was wrong —
an interpretation reached during implementation rather than a deliberate
decision. A line-by-line requirements re-read caught it, and the column,
the plumbing through both protocol clients, and a test asserting the two
fields are independent were added as a result.

---

## 9. Duplicate registration

Not mentioned in the brief.

**Interpretation:** reject a second registration of the same address
with `409`. Silently accepting it would double the device's poll traffic
and show it twice on the demo screen — which looks like a bug to a
customer even though nothing crashed. Enforced by a `UNIQUE` constraint
in the schema, not only in application code.

---

## 10. Registration of an unreachable device

**Interpretation:** succeed, leaving `protocol` null for the poller to
resolve on a later cycle.

At a trade show, gear is added to the list while it is still booting or
still being cabled. Rejecting registration because a device is not
answering *yet* would make the system most frustrating exactly when it
is being used most — during setup.
