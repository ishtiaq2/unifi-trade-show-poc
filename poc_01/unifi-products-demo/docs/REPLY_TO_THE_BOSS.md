Subject: Re: URGENT: PoC Needed for Trade Show

Hi,

The PoC is ready. One command brings up the whole thing:

    cd src && ./_02_start-trade-show.sh

That starts Postgres, six simulated devices (four REST, two gRPC) and the monitoring service. There's a web UI at http://localhost:3000 with a REST API behind it — you can add and remove devices from either.

You left a few calls to me. Here's what I decided and why:

Devices on unstable networks. A single failed check never marks a device down. Each check retries with backoff first, and only after several consecutive failures does a device move reachable → suspect → down. Recovery is the opposite: one good check clears it immediately. That asymmetry is deliberate — showing a working device as "down" in front of a customer is far worse than being a few seconds slow to show it recovered.

Logging. One structured line per state change, not per check. A device that's been fine for an hour makes no noise, so the moments that matter stand out.

Diagnostics history. Repeated identical readings just update a timestamp instead of adding a row, so the table stays readable. But any change — including an outage — is written as a new row and never overwritten. When a device drops and comes back, the record of what went wrong is still there.

Adding devices. Over the API or the UI, no restart. A device that isn't reachable yet still registers: at a trade show gear gets added while it's still being cabled, and refusing those would make the tool most annoying exactly when it's being set up.

The checksum binary. Not having it didn't block anything. There's an interface for it plus a working implementation that shells out to a binary — you switch it on by setting CHECKSUM_BINARY_PATH, no code change. Until then the checksum column is NULL rather than a made-up value. Since you said this database gets inspected offline, I'd rather it be visibly empty than look like a working integrity check that verifies nothing.

Testing. 71 automated tests, all against real Postgres, real device processes and real sockets — nothing mocked. ./_01_test-final-demo.sh runs the whole thing end to end, including killing a device and restarting it to prove the outage history survives.

Unknown hardware at the venue. Everything runs in containers, so the host only needs a container runtime — no Node or Postgres install.

Two things I need from you:

1. The checksum binary, and how it expects to be called. I've written down my assumptions about its interface, but they are guesses.

2. What "PoC life-cycle" means to you. I read it as "must be startable, testable and cleanly stoppable end to end" and built to that. If you meant something else, worth five minutes on a call.

Deliberately out of scope for now: no authentication (anyone on the network can call the API), and the gRPC side is proven against simulators rather than real hardware. Both are written up with what I'd do next.

Happy to walk through it live whenever you're free.

Best,
Ishtiaq
