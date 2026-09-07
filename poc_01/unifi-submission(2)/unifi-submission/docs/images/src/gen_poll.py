import sys
sys.path.insert(0, ".")
from seqgen import render

participants = ["Poller", "Repository", "DeviceClient", "Device", "StateMachine", "Postgres", "Logger"]

steps = [
    {"type": "note", "at": "Poller", "label": "timer fires every\\nPOLL_INTERVAL_MS"},
    {"from": "Poller", "to": "Repository", "label": "listDevices()"},
    {"from": "Repository", "to": "Postgres", "label": "SELECT * FROM devices"},
    {"from": "Postgres", "to": "Repository", "label": "device rows", "type": "return"},
    {"from": "Poller", "to": "DeviceClient", "label": "checkHealth(address)   attempt 1"},
    {"from": "DeviceClient", "to": "Device", "label": "GET /health, GET /diagnostics"},
    {"from": "Device", "to": "DeviceClient", "label": "503  (unstable network)", "type": "return"},
    {"from": "Poller", "to": "Poller", "label": "backoffDelayMs(attempt) — wait, jittered"},
    {"from": "Poller", "to": "DeviceClient", "label": "checkHealth(address)   attempt 2"},
    {"from": "DeviceClient", "to": "Device", "label": "GET /health, GET /diagnostics"},
    {"from": "Device", "to": "DeviceClient", "label": "200 OK  { diagnostics }", "type": "return"},
    {"from": "Poller", "to": "StateMachine", "label": "transition(current, succeeded=true)"},
    {"from": "StateMachine", "to": "Poller", "label": "{ status: reachable, consecutiveFailures: 0 }", "type": "return"},
    {"from": "Poller", "to": "Repository", "label": "updateStatus(id, reachable, 0)"},
    {"from": "Repository", "to": "Postgres", "label": "UPDATE devices SET status = ..."},
    {"from": "Poller", "to": "Repository", "label": "recordDiagnostics(id, payload)"},
    {"from": "Repository", "to": "Postgres", "label": "INSERT INTO diagnostics ..."},
    {"type": "note", "at": "Poller", "label": "status changed from previous cycle?\\nlog the transition, not every check"},
    {"from": "Poller", "to": "Logger", "label": "info({ from, to: reachable })"},
]

svg = render(participants, steps,
             "Poll Cycle — Retry, Backoff, State Transition  (one device, one tick)",
             width=1280)
open("/home/claude/unifi-submission/docs/images/sequence-poll-cycle.svg", "w").write(svg)
print("written")
