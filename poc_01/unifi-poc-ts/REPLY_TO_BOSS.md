# Reply to Boss

> Provided as a file so it can be reviewed alongside the code. Written the
> way it would actually be sent: short, because he is between trade shows
> and will read it on a phone.

---

**Subject: Re: URGENT: PoC Needed for Trade Show**

Hi,

It's built and running. One command on whatever machine you end up using:

```
docker compose up
```

That starts the database, the monitoring service, and six simulated
devices (routers, switches, cameras, door access — REST and gRPC). Then:

```
curl localhost:3000/devices
```

shows everything being monitored, with live status.

**On the down-device question you left to me:** a single failed check
never marks a device down. Devices move `reachable → suspect → down`,
and only after repeated failures with backed-off retries in between. I
built it that way specifically because of your unstable-network warning
— a camera on bad wifi will blip to `suspect` and recover quietly
instead of flashing "DOWN" in front of a customer. The thresholds are
environment settings, not baked into the code, so if the venue network
is worse than expected we can loosen them on-site in seconds.

One thing worth knowing at the booth: I kept the device's *own* reported
health separate from whether we can reach it. So a switch can show as
reachable while still reporting a fault about itself. That distinction
tends to come up the moment someone technical starts asking questions.

**Two things I need from you:**

1. **The checksum binary.** I've built and tested the integration point,
   so plugging it in later is a small contained change. But until we
   have the actual binary, the checksum field comes back empty rather
   than faked — I'd rather it be obviously blank than show a
   realistic-looking number that verifies nothing. If a customer asks
   about checksums, that field will be empty. Better you know now than
   at the booth.

2. **One line I couldn't fully parse** — "must be paired with the PoC
   life-cycle to get valid test results." I read that as: tests need to
   run against the real thing — real startup, real database, real
   devices — rather than against mocks, so the results actually mean
   something. That's what I built, and it's the slowest part of the test
   suite for exactly that reason. If you meant something else, tell me
   and it's a quick adjustment.

**Deliberately left out**, to keep this solid rather than broad: no UI
(you asked for an API, and a half-finished dashboard would look worse
than none), no authentication, and gRPC is verified against simulated
devices since we have no gRPC hardware here yet. All of it is written
down in the repo along with what I'd do next, so nobody has to guess
what was a decision and what was an oversight.

I used AI assistance while building this. It's documented file by file
in `AI_USAGE.md`, including a few bugs it introduced that I caught by
running things rather than reading them.

Happy to walk the team through it before the show.

— Ishtiaq
