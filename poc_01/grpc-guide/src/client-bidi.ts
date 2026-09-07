import { grpc, TutorialService } from "./proto";

const target = process.env.TARGET ?? "localhost:50051";
const client = new TutorialService(target, grpc.credentials.createInsecure());

console.log("Calling Chat (bidirectional streaming)...\n");

// Both a readable AND a writable stream on the same `call` object.
const call = client.chat();

const messages = ["hello", "how are you", "goodbye"];
let index = 0;

call.on("data", (msg: { sender: string; text: string }) => {
  console.log(`  [${msg.sender}] ${msg.text}`);

  index += 1;
  if (index < messages.length) {
    // Send the next message only after hearing back — this script
    // chooses to ping-pong, but nothing about the protocol requires
    // it. Try removing this "wait for reply" logic and writing all
    // three messages up front instead; it still works, because the
    // two streams are genuinely independent.
    call.write({ sender: "client", text: messages[index] });
  } else {
    call.end();
  }
});

call.on("end", () => {
  console.log("\nServer closed its side of the stream.");
  process.exit(0);
});

call.on("error", (err: grpc.ServiceError) => {
  console.error("Stream error:", err.message);
  process.exit(1);
});

// Kick things off with the first message.
call.write({ sender: "client", text: messages[0] });
