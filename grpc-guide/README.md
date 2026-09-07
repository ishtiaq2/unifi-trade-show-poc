# A Practical Guide to gRPC

Everything in this guide has actually been run — every output shown is
real, not written from memory. You'll do the same as you go: there's
nothing here you can't execute yourself in a few minutes.

- [What gRPC actually is](#what-grpc-actually-is)
- [The four call shapes](#the-four-call-shapes)
- [Protocol Buffers, briefly](#protocol-buffers-briefly)
- [Set up the project](#set-up-the-project)
- [Part 1 — Unary](#part-1-unary)
- [Part 2 — Server streaming](#part-2-server-streaming)
- [Part 3 — Client streaming](#part-3-client-streaming)
- [Part 4 — Bidirectional streaming](#part-4-bidirectional-streaming)
- [Testing without writing a client](#testing-without-writing-a-client)
- [Errors and status codes](#errors-and-status-codes)
- [Deadlines](#deadlines)
- [A real pitfall, reproduced live](#a-real-pitfall-reproduced-live)
- [Dynamic loading vs. code generation](#dynamic-loading-vs-code-generation)
- [Exercises](#exercises)
- [Connecting this to a real project](#connecting-this-to-a-real-project)

---

## What gRPC actually is

gRPC is a way for two programs to call functions on each other across a
network, as if they were local function calls — you write
`client.sayHello({ name: "Ishtiaq" })` in one process and a function
runs in a completely different process, possibly on another machine,
and hands back a real typed response.

Three ingredients make that work:

1. **Protocol Buffers ("protobuf")** — a schema language for describing
   messages and services, plus a compact binary wire format. You
   describe the shape of your data once, in a `.proto` file, and both
   sides agree on it.
2. **HTTP/2** — the transport underneath. Unlike HTTP/1.1, a single
   HTTP/2 connection can carry many concurrent request/response
   exchanges at once, and either side can keep sending data on a call
   that's still open. That second property is *why* streaming works at
   all — HTTP/1.1 has no way to express "I'm still sending you things."
3. **Generated (or dynamically loaded) code** — you never hand-write the
   networking code that sends a message and waits for a reply. It's
   produced from the `.proto` file, so client and server always agree on
   exactly what a `HelloRequest` looks like.

**Compared to a REST/JSON API**, the practical differences you'll feel
immediately:

| | REST + JSON | gRPC |
|---|---|---|
| Wire format | Text (JSON) | Binary (protobuf) — smaller, faster to parse |
| Contract | Informal (OpenAPI docs, hopefully) | Enforced by the `.proto` file itself |
| Call shapes | Request/response only | Request/response **and** three streaming shapes |
| Human-readable with `curl` | Yes | No — see [Testing without writing a client](#testing-without-writing-a-client) |
| Typical use | Public APIs, browsers | Service-to-service, internal systems |

Neither is "better" — gRPC's strengths (compact binary, streaming, a
strict contract) matter most between your own services; REST's
strength (any browser or `curl` can talk to it, no special client
needed) matters most at the public edge. Real systems commonly use both:
gRPC internally, REST/JSON at the edge, sometimes translated by a
gateway.

## The four call shapes

This is the actual heart of gRPC — everything else (auth, deadlines,
interceptors, load balancing) is built on top of these four patterns.

```
UNARY                          SERVER STREAMING
  client ──request──► server     client ──request──► server
  client ◄─response── server     client ◄───response── server
                                  client ◄───response── server
  (like a normal function         client ◄───response── server
   call, or a REST endpoint)      (one ask, a feed of answers —
                                   think: subscribing to updates)

CLIENT STREAMING                BIDIRECTIONAL STREAMING
  client ──request───► server     client ──message──► server
  client ──request───► server     client ◄──message── server
  client ──request───► server     client ──message──► server
  client ◄──response── server     client ◄──message── server
  (upload a bunch of things,      (both sides send whenever they
   get one result back —          want, independently — think:
   think: uploading a file        a chat, or a live collaborative
   in chunks)                     session)
```

You already know unary — it's a function call, or a REST request. The
other three all involve at least one side sending **more than once** on
the same call, which is the part that feels unfamiliar until you've
built one.

## Protocol Buffers, briefly

Here's the actual file this guide's example code uses,
`proto/tutorial.proto`:

```protobuf
syntax = "proto3";

package tutorial;

service TutorialService {
  rpc SayHello (HelloRequest) returns (HelloResponse);
  rpc CountToN (CountRequest) returns (stream CountUpdate);
  rpc UploadNumbers (stream NumberChunk) returns (UploadSummary);
  rpc Chat (stream ChatMessage) returns (stream ChatMessage);
}

message HelloRequest {
  string name = 1;
}
message HelloResponse {
  string greeting = 1;
}
```

A few things worth knowing before you read further:

- **`= 1` is not a default value — it's a field number.** Protobuf's
  binary format identifies fields by number, not by name, so the wire
  bytes never contain the string `"name"` at all — just number `1` and
  its value. This is *why* protobuf is compact. It also means field
  numbers, once used, are effectively permanent: renaming a field is
  free, but reusing an old number for a new field can make old and new
  clients misread each other's data.
- **`stream` on either side of an `rpc` line is the entire syntax** for
  choosing one of the four call shapes. No `stream` on either side is
  unary. `stream` before the request type only is client streaming.
  `stream` before the response type only is server streaming. `stream`
  on both is bidirectional.
- **Every field is optional by design in proto3** — there's no way to
  mark a field "required" at the schema level. A message with a field
  unset just gets that field's zero value (`""` for `string`, `0` for
  numbers). Design your service assuming any field might be absent.

## Set up the project

```bash
mkdir grpc-guide && cd grpc-guide
npm init -y
npm install @grpc/grpc-js @grpc/proto-loader
npm install -D typescript ts-node @types/node
```

**One thing worth doing immediately, from real experience**: pin
TypeScript explicitly.

```bash
npm install -D "typescript@^5.9.0"
```

`ts-node` (as of this writing) does not work with TypeScript 7, which
`npm install typescript` will happily give you if you don't pin it —
you'll get `TypeError: Cannot read properties of undefined (reading
'fileExists')` the moment you try to run anything, with no obvious
connection to a version mismatch. This isn't hypothetical — it's a bug
that actually happened while building this guide.

## Part 1 — Unary

The server side (`src/server.ts`, unary portion):

```typescript
function sayHello(
  call: grpc.ServerUnaryCall<{ name: string }, unknown>,
  callback: grpc.sendUnaryData<{ greeting: string }>,
): void {
  const name = call.request.name || "stranger";
  callback(null, { greeting: `Hello, ${name}!` });
}
```

The whole pattern: read `call.request`, call `callback` **exactly
once** with `(error, response)`. First argument `null` means success.

The client side (`src/client-unary.ts`):

```typescript
client.sayHello({ name: "Ishtiaq" }, (err, res) => {
  if (err) { console.error(err.message); return; }
  console.log(res.greeting);
});
```

**Run it:**

```bash
npm run server          # terminal 1, leave running
npm run demo:unary       # terminal 2
```

**Real output:**

```
Calling SayHello (unary)...

Response: Hello, Ishtiaq!
```

## Part 2 — Server streaming

Server side — note there's no callback parameter at all. `call` itself
is a writable stream:

```typescript
function countToN(call: grpc.ServerWritableStream<{ upTo: number }, unknown>): void {
  const upTo = call.request.upTo || 5;
  let i = 1;
  const timer = setInterval(() => {
    if (i > upTo) {
      clearInterval(timer);
      call.end();          // "no more messages" — call this exactly once
      return;
    }
    call.write({ value: i });  // call this as many times as you want
    i += 1;
  }, 500);
}
```

Client side — listen for events instead of getting a callback:

```typescript
const call = client.countToN({ upTo: 5 });
call.on("data", (update) => console.log("received:", update.value));
call.on("end", () => console.log("stream closed"));
```

**Run it** (server from Part 1 still running):

```bash
npm run demo:server-stream
```

**Real output — note the timestamps are genuinely ~1 second apart, not
simultaneous:**

```
Calling CountToN (server streaming)...

  received: 1  (t=15:33:15)
  received: 2  (t=15:33:15)
  received: 3  (t=15:33:16)
  received: 4  (t=15:33:16)
  received: 5  (t=15:33:17)

Server closed the stream — no more values.
```

This is the detail that's easy to miss reading about gRPC and only
clicks when you watch it happen: the client is receiving each value as
the server produces it, on one open connection — not making five
separate requests, and not waiting for the server to finish and send
everything at once.

## Part 3 — Client streaming

Now the request side streams, and the server gets a callback instead of
`call.request`:

```typescript
function uploadNumbers(
  call: grpc.ServerReadableStream<{ value: number }, unknown>,
  callback: grpc.sendUnaryData<{ count: number; sum: number }>,
): void {
  let count = 0, sum = 0;
  call.on("data", (chunk) => { count += 1; sum += chunk.value; });
  call.on("end", () => callback(null, { count, sum }));
}
```

Client side — get a writable stream back *and* pass a callback:

```typescript
const call = client.uploadNumbers((err, summary) => {
  console.log(`count=${summary.count}, sum=${summary.sum}`);
});
for (const value of [3, 1, 4, 1, 5, 9, 2, 6]) {
  call.write({ value });
}
call.end();  // <- without this, the server waits forever
```

**Run it:**

```bash
npm run demo:client-stream
```

**Real output:**

```
Calling UploadNumbers (client streaming)...

  sending: 3
  sending: 1
  sending: 4
  sending: 1
  sending: 5
  sending: 9
  sending: 2
  sending: 6

Server's summary: count=8, sum=31
```

3+1+4+1+5+9+2+6 = 31 — the server genuinely summed what it received,
one chunk at a time, not all at once.

**The single most common bug in client streaming**: forgetting
`call.end()`. The server's `'end'` handler never fires, the callback
never runs, and the client just hangs — no error, no timeout by
default, nothing. Comment out that line yourself and watch it happen.

## Part 4 — Bidirectional streaming

Both sides of `call` are live at once — readable and writable on the
same object:

```typescript
function chat(call: grpc.ServerDuplexStream<{ sender: string; text: string }, unknown>): void {
  call.on("data", (msg) => {
    call.write({ sender: "server", text: msg.text.toUpperCase() });
  });
  call.on("end", () => call.end());
}
```

Client side is symmetric — also both readable and writable:

```typescript
const call = client.chat();
call.on("data", (msg) => console.log(`[${msg.sender}] ${msg.text}`));
call.write({ sender: "client", text: "hello" });
```

**Run it:**

```bash
npm run demo:bidi
```

**Real output:**

```
Calling Chat (bidirectional streaming)...

  [server] HELLO
  [server] HOW ARE YOU
  [server] GOODBYE

Server closed its side of the stream.
```

The example script waits for each reply before sending the next message
(a ping-pong pattern), but nothing about bidirectional streaming
requires that — it's a choice the client script makes, not a protocol
rule. Try editing `src/client-bidi.ts` to fire all three `call.write()`s
immediately instead of waiting for replies; it still works, because the
two streams genuinely don't block each other.

## Testing without writing a client

Sometimes you just want to poke a running gRPC server the way you'd
`curl` a REST endpoint. `curl` itself can't do this — gRPC's HTTP/2 +
binary framing isn't something `curl` speaks — but
[`grpcurl`](https://github.com/fullstorydev/grpcurl) fills that role:

```bash
grpcurl -plaintext -proto proto/tutorial.proto \
  -d '{"name": "Ishtiaq"}' \
  localhost:50051 tutorial.TutorialService/SayHello
```

`-plaintext` because this example server has no TLS (fine for local
development, never for anything real — see Exercises). `-proto` points
`grpcurl` at the schema directly; servers can also expose it via
**reflection**, which lets `grpcurl` (and tools like Postman) discover
the schema without a local `.proto` file — worth adding once you're
past the tutorial stage.

## Errors and status codes

Unlike REST's open-ended HTTP status codes, gRPC has a fixed, small set
— `grpc.status.NOT_FOUND`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`,
`INVALID_ARGUMENT`, and so on. Return one from a unary or
server-streaming handler like this:

```typescript
callback({
  code: grpc.status.NOT_FOUND,
  message: "No such thing",
});
```

The client sees it as `err.code` and `err.message` on the error object,
not a thrown exception mid-callback — check `err` the same way you'd
check any Node.js `(err, result)` callback.

## Deadlines

Every call can carry a deadline — a point in time after which the
client gives up, freeing it from the network stack's own (often very
long) default timeouts:

```typescript
const deadline = Date.now() + 2000; // 2 seconds from now
client.sayHello({ name: "x" }, { deadline }, (err, res) => { ... });
```

A call that misses its deadline fails with
`grpc.status.DEADLINE_EXCEEDED` on the client — the server may or may
not have finished the work; a deadline is a promise about how long the
*client* will wait, not an instruction that cancels server-side work by
itself (cancellation propagation is a related but separate mechanism).

## A real pitfall, reproduced live

`@grpc/proto-loader`'s `keepCase` option controls whether protobuf
field names arrive in JavaScript as written in the `.proto` file, or
converted to camelCase. **The client and server must agree on this
setting.** Here's what happens when they don't — this was actually run,
not described from memory.

`pitfalls/snake_case.proto` has one field, `hardware_version`. Server
loads with `keepCase: false` and replies with `{ hardwareVersion:
"HW-1.0" }` (correct for its own setting). A client loads the *same*
proto with `keepCase: true`:

```
Raw response object: { hardware_version: 'HW-1.0' }
res.hardwareVersion  -> undefined
res.hardware_version -> HW-1.0
```

**The data arrived correctly** — nothing was lost on the wire. But if
the rest of that client's codebase was written assuming camelCase (as
JS/TS code conventionally is), `res.hardwareVersion` silently reads
`undefined`. No error, no crash — just a value quietly missing,
discovered only when something downstream breaks in a way that doesn't
obviously point back here.

Fix: match the setting on both sides.

```
res.hardwareVersion -> HW-1.0
```

Run both versions yourself:

```bash
node pitfalls/keepcase-server.js &        # terminal 1
node pitfalls/keepcase-client-broken.js    # terminal 2 — see the undefined
node pitfalls/keepcase-client-fixed.js      # terminal 2 — see it fixed
```

## Dynamic loading vs. code generation

Every example above uses **dynamic loading**
(`protoLoader.loadSync(...)`) — the `.proto` file is read and turned
into callable objects at runtime, with no separate compile step. This
is the fastest way to get started, and it's what this guide (and the
device simulators referenced below) uses throughout.

The alternative is **code generation**: running `protoc` (or `buf`)
ahead of time to produce real, importable `.ts` files with actual
`interface` and `class` declarations for every message and service.

| | Dynamic loading | Code generation |
|---|---|---|
| Setup | Nothing extra — install two npm packages | A codegen tool + a build step |
| Type safety | `any`-shaped at the boundary — the `keepCase` bug above is exactly the kind of mistake generated types would catch at compile time | Full — a typo'd field name is a compile error, not a silent `undefined` |
| Best for | Prototypes, small projects, learning | Larger codebases where the compile-time guarantee earns back the setup cost |

Worth trying once you're comfortable with the concepts here: run
`protoc` with `ts-proto` against `proto/tutorial.proto` and see the
`keepCase` pitfall above become a compile error instead of a runtime
surprise.

## Exercises

Roughly in order of how much they'll teach you:

1. **Break `call.end()`** in the client-streaming demo. Watch it hang.
   Add a deadline to the client call and watch it fail cleanly instead.
2. **Add a fifth RPC**: `rpc Subtract (TwoNumbers) returns (Result)`.
   Write the message types, implement it on both sides, without looking
   back at `SayHello` for the pattern.
3. **Make the bidirectional chat fire-and-forget** instead of
   ping-pong — write all three client messages immediately instead of
   waiting for each reply. Confirm all three still arrive.
4. **Add TLS.** Real gRPC almost never runs with
   `createInsecure()`; try `grpc.ServerCredentials.createSsl(...)` with
   a self-signed cert.
5. **Enable server reflection** and query the running server with
   `grpcurl` *without* passing `-proto` at all.
6. **Try code generation** (previous section) and see which of your
   own bugs from these exercises become compile errors instead.

## Connecting this to a real project

The device simulators in `../devices/_shared/grpc-simulator.ts` use
exactly the pattern from Part 1 of this guide — dynamic loading, a
single unary RPC (`GetHealth`), the same `keepCase` option this guide
just showed you how to break. Reading that file after finishing this
guide should feel completely familiar rather than like new material.

A natural next step, if you want to practice on real code instead of
this tutorial's toy example: add a genuine **server-streaming** RPC to
that project — something like `SubscribeStatus`, which pushes a status
update to a client every time it changes, instead of the client having
to poll `GetHealth` repeatedly. That's a real, useful feature, and
you'd be building it with knowledge you didn't have before this guide.
