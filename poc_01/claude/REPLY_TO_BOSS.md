# Reply to Boss

> Delivered as a file rather than pasted into a commit message so it's
> reviewable alongside the code. Written as I'd actually send it: short,
> because he's between trade shows and won't read three pages.

---

**Subject: Re: URGENT: PoC Needed for Trade Show**

Hi,

It's built and running. Full setup is one command:

```
docker compose up
```

That brings up the service, the database, and six simulated devices
(routers, switches, cameras, door access — REST and gRPC). Then
`curl localhost:3000/devices` shows everything being monitored. Should
work on whatever machine you end up hosting it on at the venue.

**On the "device is down" question you left to me:** a single failed
check never marks a device down. Devices go `reachable → suspect → down`
only after repeated failures, with backed-off retries in between. I set
this up specifically because of the unstable-network warning — a device
behind bad wifi will show as `suspect` and recover quietly rather than
lighting up as `down` in front of a customer. Thresholds are config
values, so if the venue's network is worse than expected we can loosen
them on-site without a code change.

One thing worth knowing at the booth: I kept the device's *own* reported
health separate from whether we can reach it. So a switch can show as
reachable while still reporting a fault about itself. That distinction
tends to matter when someone technical starts asking questions.

**Two things I need from you:**

1. **The checksum binary.** I've built the integration point for it, so
   plugging it in later is a small, contained change — but until we have
   the actual binary, checksums come back empty rather than faked. If a
   customer asks about checksums at the booth, that field will be blank.
   Worth knowing before you're standing in front of one.

2. **One line in your email I couldn't fully parse** — "must be paired
   with the PoC life-cycle to get valid test results." I read that as:
   tests need to run against the real thing (real startup, real database,
   real devices) rather than against mocks, so the results actually mean
   something. That's what I built. If you meant something else, tell me
   and it's a quick adjustment.

**Deliberately left out**, to keep this solid rather than broad: no UI
(you asked for an API, and a half-finished dashboard would look worse
than none), no auth, and the gRPC support is proven against simulated
devices only since we don't have gRPC hardware here yet. All of it is
documented in the repo along with what I'd do next.

I used AI assistance while building this — that's documented file by
file in `AI_USAGE.md`, including a couple of bugs it introduced that I
caught by actually running things rather than reading the code.

Happy to walk anyone through it before the show.

—Ishtiaq
