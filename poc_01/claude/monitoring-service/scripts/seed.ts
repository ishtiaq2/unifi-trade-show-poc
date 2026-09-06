/**
 * Registers the 6 device simulators from ../devices via the service's own
 * HTTP API — not by writing directly to Postgres. Using the real API
 * means this script is also, incidentally, an end-to-end smoke test of
 * POST /devices and capability discovery every time it's run.
 */
const BASE_URL = process.env.MONITORING_SERVICE_URL ?? "http://localhost:3000";

const DEVICES = [
  { name: "router-1", address: "localhost:4001" },
  { name: "switch-1", address: "localhost:4002" },
  { name: "camera-rest-1", address: "localhost:4003" },
  { name: "door-access-rest-1", address: "localhost:4004" },
  { name: "camera-grpc-1", address: "localhost:4005" },
  { name: "door-access-grpc-1", address: "localhost:4006" },
];

async function main() {
  for (const device of DEVICES) {
    const res = await fetch(`${BASE_URL}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(device),
    });
    const body = (await res.json()) as { id?: string; protocol?: string | null; error?: unknown };
    if (!res.ok) {
      console.error(`Failed to register ${device.name}:`, body);
      continue;
    }
    console.log(`Registered ${device.name} -> protocol=${body.protocol ?? "(pending discovery)"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
