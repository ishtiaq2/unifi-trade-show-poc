import { grpc, TutorialService } from "./proto";

const PORT = process.env.PORT ?? "50051";

/**
 * UNARY: (req, callback) => void. Do the work, call callback exactly
 * once with (error, response). This is the shape you already know if
 * you've written a REST handler — one thing in, one thing out.
 */
function sayHello(
  call: grpc.ServerUnaryCall<{ name: string }, unknown>,
  callback: grpc.sendUnaryData<{ greeting: string }>,
): void {
  const name = call.request.name || "stranger";
  callback(null, { greeting: `Hello, ${name}!` });
}

/**
 * SERVER STREAMING: (call) => void, no callback. `call` is a writable
 * stream — `call.write(msg)` as many times as you want, then
 * `call.end()` exactly once when done. The client receives each write
 * as a separate message, in order, as it happens — not batched at the
 * end.
 */
function countToN(call: grpc.ServerWritableStream<{ upTo: number }, unknown>): void {
  const upTo = call.request.upTo || 5;
  let i = 1;

  // setInterval to make the streaming visible when you run this — each
  // number really does arrive at the client half a second apart, not
  // all at once. Remove the delay and it still works, just instantly.
  const timer = setInterval(() => {
    if (i > upTo) {
      clearInterval(timer);
      call.end(); // signals "no more messages" — the client's stream ends here
      return;
    }
    call.write({ value: i });
    i += 1;
  }, 500);

  // If the client disconnects early (closes the connection, or the
  // process exits), stop writing — otherwise this timer leaks forever.
  call.on("cancelled", () => clearInterval(timer));
}

/**
 * CLIENT STREAMING: (call, callback) => void. `call` is a readable
 * stream this time — listen for 'data' as the client sends each chunk,
 * 'end' when the client signals it's done sending. Call the callback
 * exactly once, after 'end', with the single combined response.
 */
function uploadNumbers(
  call: grpc.ServerReadableStream<{ value: number }, unknown>,
  callback: grpc.sendUnaryData<{ count: number; sum: number }>,
): void {
  let count = 0;
  let sum = 0;

  call.on("data", (chunk: { value: number }) => {
    count += 1;
    sum += chunk.value;
  });

  call.on("end", () => {
    callback(null, { count, sum });
  });

  // A real server would also handle call.on("error", ...) here — a
  // client that disconnects mid-upload fires 'error', not 'end'.
}

/**
 * BIDIRECTIONAL STREAMING: (call) => void. `call` is BOTH a readable
 * and a writable stream on the SAME object. Nothing forces you to
 * respond to each incoming message before the next arrives, or even to
 * respond 1:1 — that's what makes this shape different from "client
 * streaming then server streaming glued together". Here we do respond
 * to each message immediately, which is the simplest useful pattern
 * (an echo), but the two streams are genuinely independent.
 */
function chat(call: grpc.ServerDuplexStream<{ sender: string; text: string }, unknown>): void {
  call.on("data", (msg: { sender: string; text: string }) => {
    call.write({ sender: "server", text: msg.text.toUpperCase() });
  });

  call.on("end", () => {
    call.end(); // close our side once the client closes theirs
  });
}

function main(): void {
  const server = new grpc.Server();
  server.addService(TutorialService.service, {
    sayHello,
    countToN,
    uploadNumbers,
    chat,
  });

  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err) => {
      if (err) {
        console.error("Failed to bind:", err);
        process.exit(1);
      }
      console.log(`Tutorial gRPC server listening on :${PORT}`);
    },
  );
}

main();
