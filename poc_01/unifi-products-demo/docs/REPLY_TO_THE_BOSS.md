Subject: Re: URGENT: PoC Needed for Trade Show

Hi,

The PoC is ready. Three commands from a clean machine:

    cd src
    ./_02_start-trade-show.sh      # starts everything
    ./_05_auto_register_devices.sh  # registers all 6 devices

The first brings up Postgres, six simulated devices (four REST, two gRPC) and the monitoring service. The second finds the running devices and registers them automatically — it skips anything already registered, so it's safe to re-run.

Then open http://localhost:3000 in a browser. That's the whole demo: a live list of every device, its status, and a telemetry panel showing the diagnostics we pull back (HW/SW/FW version, what the device reports about itself, checksum). It refreshes on its own, so you can leave it on a screen at the booth.

To show it handling new gear live, add a device from the UI — name and address, e.g. "switch-2" and "switch:4002". It appears in the list immediately, gets discovered on the next cycle, and starts reporting. No restart, no config file. Deleting is a button on the row. Same thing over the API if you prefer:

    curl -X POST http://localhost:3000/devices \
      -H "Content-Type: application/json" \
      -d '{"name":"switch-2","address":"switch:4002"}'

A few calls you left to me, and why I made them:

Devices on unstable networks. A single failed check never marks a device down. Each check retries with backoff first, and only after several consecutive failures does a device go reachable → suspect → down. Recovery is the opposite — one good check clears it immediately. Showing a working device as "down" in front of a customer is worse than being a few seconds slow to show it recovered.

Logging. One line per state change, not per check. A device that's been fine for an hour makes no noise, so the moments that matter stand out.

Diagnostics history. Repeated identical readings just bump a timestamp instead of adding a row, so the table stays readable. But any change — including an outage — is a new row and never gets overwritten. When a device drops and comes back, the record of what went wrong is still there.

Adding devices. A device that isn't reachable yet still registers. At a trade show gear gets added while it's still being cabled, and refusing those would make the tool most annoying exactly when it's being set up.

The checksum binary. Not having it didn't block anything. There's an interface plus a working implementation that shells out to a binary — switch it on with CHECKSUM_BINARY_PATH, no code change. Until then the checksum column is NULL rather than a made-up value. Since you said this database gets inspected offline, I'd rather it be visibly empty than look like a working integrity check that verifies nothing.

Testing. 71 automated tests against real Postgres, real device processes and real sockets — nothing mocked. ./_01_test-final-demo.sh runs the whole thing end to end, including killing a device and restarting it to prove the outage history survives.

Unknown hardware at the venue. Everything runs in containers, so the host only needs a container runtime — no Node or Postgres install.

Two things I need from you:

1. The checksum binary, and how it expects to be called. I've written down my assumptions about its interface, but they're guesses.

2. What "PoC life-cycle" means to you. I read it as "must be startable, testable and cleanly stoppable end to end" and built to that. If you meant something else, worth five minutes on a call.

Deliberately out of scope: no authentication (anyone on the network can call the API), and the gRPC side is proven against simulators rather than real hardware. Both are written up with what I'd do next.

Happy to walk through it live whenever you're free.

Best,
Ishtiaq
