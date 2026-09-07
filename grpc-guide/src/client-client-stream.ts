import { grpc, TutorialService } from "./proto";

const target = process.env.TARGET ?? "localhost:50051";
const client = new TutorialService(target, grpc.credentials.createInsecure());

console.log("Calling UploadNumbers (client streaming)...\n");

// This time WE get the writable stream, and the callback fires once,
// after the server has seen everything and we've called end().
const numbers = [3, 1, 4, 1, 5, 9, 2, 6];

const call = client.uploadNumbers(
  (err: grpc.ServiceError | null, summary: { count: number; sum: number }) => {
    if (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
    console.log(`\nServer's summary: count=${summary.count}, sum=${summary.sum}`);
    process.exit(0);
  },
);

for (const value of numbers) {
  console.log(`  sending: ${value}`);
  call.write({ value });
}

// Signals "I'm done sending" — without this, the server waits forever
// for 'end' and the callback above never fires. This is the single most
// common client-streaming bug.
call.end();
