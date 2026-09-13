# ChecksumProvider — Step 9

The seam for the external checksum binary the brief describes as not
yet available.

```
src/checksum/
├── ChecksumProvider.ts         the interface
├── StubChecksumProvider.ts      in use now — returns null, honestly
├── BinaryChecksumProvider.ts    ready for when the binary arrives
└── checksumFactory.ts            picks one based on config
```

## The decision this step is really about

The obvious shortcut is to hash the diagnostics payload — sha256 of
the version strings — so the column has real-looking data in it for
the demo. **That would be actively harmful**, for a specific reason:

A checksum's purpose is verifying that firmware on a device matches
what it should be. A hash computed by *this service* from data the
device *just reported* verifies nothing at all — it's a hash of the
device's own claims, not of the firmware. It would look exactly like a
working integrity check while providing zero integrity guarantee.

The brief says this database gets inspected offline. A realistic-
looking hash that verifies nothing is strictly worse than an obviously
absent one: the null is self-documenting, the fake hash silently lies.
Someone reading the table can tell at a glance that checksums aren't
available yet; they could not tell a sha256 was meaningless without
reading the source.

So `StubChecksumProvider` returns `null`. Always. That's the whole
implementation, and there's a test asserting it stays that way.

## Why build BinaryChecksumProvider before the binary exists

It's not speculative code for its own sake — it's the difference
between "we've thought about the integration" and "we'll figure it out
when it lands." Writing it now forces the open questions to be
concrete and written down, in the file itself:

1. Invoked as `<binary> <deviceId>`, diagnostics as JSON on stdin?
2. Checksum on stdout, one line, nothing else?
3. Exit 0 = success, non-zero = couldn't compute?
4. Terminates on its own?

Every one of those could be wrong. They're documented as assumptions
precisely *because* they're guesses — they're the questions to ask
whoever owns the binary, recorded where they can't be forgotten. That
list is more useful than a "flexible" implementation guessing at
several conventions: more code, still unverified, harder to correct
once the truth is known.

## Two details that matter more than they look

**`execFile`, not `exec`.** No shell is spawned, so a device-supplied
value reaching this path can't become shell injection. Diagnostics
come from devices on an untrusted network; interpolating them into a
shell string would be a genuine vulnerability. There's a test that
passes `` id; echo pwned `whoami` `` as a device ID and asserts it
comes back as a literal string.

**The checksum is computed *after* the dedup decision, not before.** A
deduplicated reading doesn't insert a row, so a checksum computed for
it would be discarded. With the stub that's merely wasteful; with the
real binary it would mean spawning a process on every poll cycle of
every stable device and throwing the result away.

## Switching it on

```bash
CHECKSUM_BINARY_PATH=/path/to/binary
```

No code change. The service logs which implementation is live at
startup, so it's never ambiguous when reading a log:

```
{"level":"info","msg":"checksum provider: stub (no CHECKSUM_BINARY_PATH set — checksums will be null)"}
{"level":"info","msg":"checksum provider: binary","binaryPath":"/path/to/binary"}
```

Defaults to the stub deliberately — the service must start and run
correctly with no binary present, because that's the current reality.

## Testing

```bash
npx vitest run test/checksum.spec.ts    # 14 tests
npm test                                 # full suite, 62 tests
```

`BinaryChecksumProvider` is tested against **real executable scripts**
written to a temp directory, not a mocked `child_process`. The entire
risk in that class is how it handles a real external process — exit
codes, stdout parsing, timeouts, a missing file. Mocking
`child_process` would only confirm the code calls `execFile`, which is
the one part that can't really be wrong.

Covered: normal output, argument passing, non-zero exit, missing
binary, empty stdout (→ null, not `""`), a hung binary hitting the
timeout, and the shell-injection case.

## Verified

Run, not assumed:

- 14/14 new tests pass; **62/62 total**, no regressions from step 8's 48.
- Typechecks clean under `strict: true`.
- **End-to-end, both paths, against real Postgres and a real device:**

  Without the binary configured:
  ```
  {"msg":"checksum provider: stub (no CHECKSUM_BINARY_PATH set — checksums will be null)"}
  router-1|<NULL>
  ```

  With `CHECKSUM_BINARY_PATH` set to a stand-in script — *identical
  code, one environment variable*:
  ```
  {"msg":"checksum provider: binary","binaryPath":"/tmp/fake-checksum.sh"}
  router-1|sha256-fake-for-582ff103-f1a2-416a-b1ec-f86716aa27e3
  ```
  The device ID in the output confirms the binary received the right
  argument and its stdout landed in the right column.

## Next

Step 10: the life-cycle test — booting the real entrypoint end to end,
the last item on the roadmap.
