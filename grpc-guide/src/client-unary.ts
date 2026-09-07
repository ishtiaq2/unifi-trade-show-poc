import { grpc, TutorialService } from "./proto";

const target = process.env.TARGET ?? "localhost:50051";
const client = new TutorialService(target, grpc.credentials.createInsecure());

console.log("Calling SayHello (unary)...\n");

// Fire the call, get one callback, done. This is the entire client-side
// shape for a unary RPC.
client.sayHello({ name: "Ishtiaq" }, (err: grpc.ServiceError | null, res: { greeting: string }) => {
  if (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
  console.log("Response:", res.greeting);
  process.exit(0);
});
