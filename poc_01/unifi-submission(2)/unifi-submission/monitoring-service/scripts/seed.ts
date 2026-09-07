/**
 * Registers the six device simulators through the service's own HTTP API
 * rather than by writing to Postgres directly.
 *
 * Going through the API means this doubles as an end-to-end smoke test of
 * POST /devices and capability discovery every time it runs — and it
 * cannot drift from the real registration path, because it *is* the real
 * registration path.
 */
const BASE_URL = process.env.MONITORING_SERVICE_URL ?? "http://localhost:3000";

// Addresses default to localhost for running everything on one machine.
// Under docker-compose the simulators are reachable by service name, so
// DEVICE_HOST_PREFIX is not used; instead each device's own hostname is
// substituted via DEVICE_HOSTS=compose (see README).
const useComposeHosts = process.env.DEVICE_HOSTS === "compose";
const host = (service: string) => (useComposeHosts ? service : "localhost");

const DEVICES = [
  { name: "router-1", address: `${host("router")}:4001` },
  { name: "switch-1", address: `${host("switch")}:4002` },
  { name: "camera-rest-1", address: `${host("camera-rest")}:4003` },
  { name: "door-access-rest-1", address: `${host("door-access-rest")}:4004` },
  { name: "camera-grpc-1", address: `${host("camera-grpc")}:4005` },
  { name: "door-access-grpc-1", address: `${host("door-access-grpc")}:4006` },
];

interface RegisteredDevice {
  id: string;
  protocol: string | null;
}

async function main(): Promise<void> {
  for (const device of DEVICES) {
    const res = await fetch(`${BASE_URL}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(device),
    });

    if (res.status === 409) {
      console.log(`${device.name}: already registered, skipping`);
      continue;
    }
    if (!res.ok) {
      console.error(`${device.name}: registration failed (HTTP ${res.status})`);
      continue;
    }

    const body = (await res.json()) as RegisteredDevice;
    console.log(
      `${device.name}: registered, protocol=${body.protocol ?? "(discovery pending)"}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
