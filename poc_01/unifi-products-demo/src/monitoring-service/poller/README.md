Poller
│
├── Every 10 seconds
│
└── runCycle()
    │
    ├── Get devices from DB
    │
    └── For each device (in parallel)
        │
        ├── No protocol?
        │      └── Discover device
        │
        └── Has protocol?
            │
            ├── Health check
            ├── Retry up to 3 times
            ├── Update state
            ├── Save status
            └── Save diagnostics

---

run cycle
    ↓
wait until cycle finishes
    ↓
schedule next cycle
    ↓
wait 10 seconds
    ↓
run cycle

---

Cycle 1:
        Router ────────>
        Switch ────────>
        Camera ────────>
        Door ──────────>
            wait 10 sec
                Cycle 2:
                    Router ────────>
                    Switch ────────>
                    Camera ────────>
                    Door ──────────>
---
