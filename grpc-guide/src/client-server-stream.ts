import { grpc, TutorialService } from "./proto";

const target = process.env.TARGET ?? "localhost:50051";
const client = new TutorialService(target, grpc.credentials.createInsecure());

console.log("Calling CountToN (server streaming)...\n");

// One call, no request-side callback — `call` is a readable stream.
// Watch the timestamps: each 'data' event really does arrive roughly
// 500ms apart, because the server is writing them that way.
const call = client.countToN({ upTo: 5 });

call.on("data", (update: { value: number }) => {
  console.log(`  received: ${update.value}  (t=${new Date().toISOString().slice(11, 19)})`);
});

call.on("end", () => {
  console.log("\nServer closed the stream — no more values.");
  process.exit(0);
});

call.on("error", (err: grpc.ServiceError) => {
  console.error("Stream error:", err.message);
  process.exit(1);
});
