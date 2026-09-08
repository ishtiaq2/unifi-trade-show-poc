/**
 * Guided demo of the gRPC devices.
 *
 *   npm run demo
 *
 * Walks through every behavior the devices implement, calling real RPCs
 * over real sockets against all four simulators. Nothing here is
 * simulated at the client level — every result printed is an actual
 * response (or an actual gRPC error) from a running server.
 *
 * Requires all four devices to be running: `npm run devices` or
 * `docker compose up`.
 */
import * as grpc from "@grpc/grpc-js";
import { loadDeviceProto } from "../_shared/grpc-simulator";

const deviceProto = loadDeviceProto();

const DEVICES = {
  healthy: { name: "camera-grpc-1", target: hostFor("camera-grpc", 4005) },
  degraded: { name: "door-access-grpc-1", target: hostFor("door-access-grpc", 4006) },
  flaky: { name: "camera-grpc-flaky-1", target: hostFor("camera-grpc-flaky", 4007) },
  dying: { name: "door-access-grpc-dying-1", target: hostFor("door-access-grpc-dying", 4008) },
};

/** Inside compose, devices are reachable by service name; on the host, by localhost. */
function hostFor(service: string, port: number): string {
  const inCompose = process.env.DEVICE_HOSTS === "compose";
  return `${inCompose ? service : "localhost"}:${port}`;
}

function clientFor(target: string): any {
  return new deviceProto.DeviceService(target, grpc.credentials.createInsecure());
}

interface Health {
  protocol: string;
  capabilities: string[];
  deviceName: string;
}
interface Diagnostics {
  hwVersion: string;
  swVersion: string;
  fwVersion: string;
  status: string;
}

/** Promise wrapper around a unary call, with an explicit deadline. */
function call<T>(client: any, method: string, timeoutMs = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    client[method](
      {},
      { deadline: Date.now() + timeoutMs },
      (err: grpc.ServiceError | null, res: T) => (err ? reject(err) : resolve(res)),
    );
  });
}

const line = (s = "") => console.log(s);
const rule = (title: string) => {
  line();
  line("─".repeat(72));
  line(`  ${title}`);
  line("─".repeat(72));
};

async function step1_healthyDevice(): Promise<void> {
  rule("1. A healthy device — the two RPCs this service exposes");
  const client = clientFor(DEVICES.healthy.target);

  const health = await call<Health>(client, "getHealth");
  line(`  GetHealth      -> protocol=${health.protocol}  device=${health.deviceName}`);
  line(`                    capabilities=[${health.capabilities.join(", ")}]`);
  line();
  line("  GetHealth is capability discovery: it tells a client what this");
  line("  device is and what it supports, before asking for anything else.");
  line();

  const diag = await call<Diagnostics>(client, "getDiagnostics");
  line(`  GetDiagnostics -> hw=${diag.hwVersion} sw=${diag.swVersion} fw=${diag.fwVersion}`);
  line(`                    self-reported status = "${diag.status}"`);
}

async function step2_reachableButDegraded(): Promise<void> {
  rule("2. Reachable is NOT the same as healthy");
  const client = clientFor(DEVICES.degraded.target);

  const diag = await call<Diagnostics>(client, "getDiagnostics");
  line(`  ${DEVICES.degraded.name}`);
  line(`    gRPC status      : OK  (every RPC succeeds)`);
  line(`    self-reported    : "${diag.status}"`);
  line();
  line("  The RPC succeeded. The device is telling us it has a fault anyway.");
  line("  A client that only checks for gRPC errors would call this healthy.");
  line("  Both signals have to be read: the status code AND the payload.");
}

async function step3_flakyDevice(): Promise<void> {
  rule("3. A failed RPC is not a failed device (flaky link)");
  const client = clientFor(DEVICES.flaky.target);

  line(`  Calling GetHealth 12 times against ${DEVICES.flaky.name}:`);
  line();
  let ok = 0;
  let failed = 0;
  const marks: string[] = [];
  for (let i = 0; i < 12; i++) {
    try {
      await call<Health>(client, "getHealth");
      ok += 1;
      marks.push("ok ");
    } catch {
      failed += 1;
      marks.push("ERR");
    }
  }
  line(`    ${marks.join(" ")}`);
  line();
  line(`  ${ok} succeeded, ${failed} failed — and the device was never actually`);
  line("  broken. This is an unstable link, not a dead device. A client that");
  line("  concluded 'down' from the first ERR would be raising a false alarm.");
}

async function step4_dyingDevice(): Promise<void> {
  rule("4. A device that genuinely dies (and stays dead)");
  const client = clientFor(DEVICES.dying.target);

  line(`  Calling GetHealth 10 times against ${DEVICES.dying.name}:`);
  line();
  const marks: string[] = [];
  for (let i = 0; i < 10; i++) {
    try {
      await call<Health>(client, "getHealth");
      marks.push("ok ");
    } catch {
      marks.push("ERR");
    }
  }
  line(`    ${marks.join(" ")}`);
  line();
  line("  Healthy, then permanently failing — it never recovers. Contrast");
  line("  with step 3: retrying helps there and is futile here, which is why");
  line("  retries need a bound rather than running forever.");
}

async function step5_errorCodes(): Promise<void> {
  rule("5. gRPC error codes — what a client actually receives");

  line("  a) Connecting to a port with nothing listening:");
  const dead = clientFor("localhost:59999");
  try {
    await call<Health>(dead, "getHealth", 1500);
    line("     unexpectedly succeeded");
  } catch (err) {
    const e = err as grpc.ServiceError;
    line(`     code ${e.code} (${grpc.status[e.code]})`);
    line(`     message: ${e.message}`);
  }
  line();

  line("  b) A deadline too short for the call to complete:");
  const client = clientFor(DEVICES.healthy.target);
  try {
    // 1ms deadline — expires before the round trip can finish.
    await call<Health>(client, "getHealth", 1);
    line("     completed within 1ms (fast machine — try 0 to force it)");
  } catch (err) {
    const e = err as grpc.ServiceError;
    line(`     code ${e.code} (${grpc.status[e.code]})`);
  }
  line();
  line("  gRPC has a small fixed set of status codes, unlike HTTP's open");
  line("  range. UNAVAILABLE means 'could not reach it'; DEADLINE_EXCEEDED");
  line("  means 'gave up waiting' — the server may still be working.");
}

async function main(): Promise<void> {
  line();
  line("  gRPC Device Demo");
  line("  Every result below is a real RPC against a real running server.");

  try {
    await step1_healthyDevice();
    await step2_reachableButDegraded();
    await step3_flakyDevice();
    await step4_dyingDevice();
    await step5_errorCodes();
  } catch (err) {
    const e = err as grpc.ServiceError;
    line();
    line("  Demo could not complete.");
    line(`  ${e.message}`);
    line();
    line("  Are all four devices running? Start them with:");
    line("      npm run devices          (or: docker compose up)");
    process.exit(1);
  }

  rule("Done");
  line("  Devices are still running. Try them yourself:");
  line("      npm run client -- localhost:4005     # healthy camera");
  line("      npm run client -- localhost:4006     # self-reports degraded");
  line("      npm run client -- localhost:4007     # flaky, run it repeatedly");
  line();
  process.exit(0);
}

main();
