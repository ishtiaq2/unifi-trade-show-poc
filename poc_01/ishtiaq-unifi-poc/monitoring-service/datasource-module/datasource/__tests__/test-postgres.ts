// datasource/__tests__/test-postgres.ts
//
// Integration test for DeviceRepository against a REAL Postgres.
// Nothing is mocked here on purpose: the entire job of this module is
// talking to a database, so a mocked test could only confirm the code
// calls the methods the test expects. It could not catch a malformed
// query, a wrong column name, or a constraint that doesn't behave as
// assumed — which are the failures that actually happen at this layer.
//
//   npm test                     # against localhost
//   DB_HOST=unifi-db npm test     # against the container
import { Pool } from "pg";
import { DeviceRepository } from "../postgres";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "poc",
  password: process.env.DB_PASSWORD || "poc",
  database: process.env.DB_NAME || "poc",
});

// A distinctive address, so cleanup can find leftovers from an aborted
// run without touching anything real.
const TEST_ADDRESS = "test-harness:4001";

let checks = 0;

/** Throws on failure — that is what makes the process exit non-zero. */
function assert(condition: boolean, description: string): void {
  checks += 1;
  if (!condition) throw new Error(`Assertion failed: ${description}`);
  console.log(`  ok  ${description}`);
}

async function runTests(): Promise<void> {
  const repo = new DeviceRepository(pool);

  // Clear anything a previous aborted run left behind. Without this the
  // UNIQUE constraint on `address` makes the next run fail for a reason
  // that has nothing to do with the code under test.
  await pool.query("DELETE FROM devices WHERE address = $1", [TEST_ADDRESS]);

  console.log("\n--- 1. Creating a device ---");
  const device = await repo.createDevice({
    name: "Test Router",
    address: TEST_ADDRESS,
  });
  assert(!!device.id, "returns a generated id");
  assert(device.name === "Test Router", "stores the name");
  assert(device.status === "reachable", "defaults status to reachable");
  assert(device.consecutiveFailures === 0, "defaults failures to 0");
  assert(device.protocol === null, "protocol is null until discovered");

  console.log("\n--- 2. Finding it back ---");
  const found = await repo.findByAddress(TEST_ADDRESS);
  assert(found?.id === device.id, "findByAddress returns the same device");
  const listed = await repo.listDevices();
  assert(
    listed.some((d) => d.id === device.id),
    "listDevices includes it",
  );

  console.log("\n--- 3. Updating status ---");
  await repo.updateStatus(device.id, "suspect", 2, false);
  const suspect = await repo.getDevice(device.id);
  assert(suspect?.status === "suspect", "status updated to suspect");
  assert(suspect?.consecutiveFailures === 2, "failure count updated");
  assert(suspect?.lastCheckedAt !== null, "lastCheckedAt set");
  assert(
    suspect?.lastSuccessAt === null,
    "lastSuccessAt NOT set on a failed check",
  );

  await repo.updateStatus(device.id, "reachable", 0, true);
  const recovered = await repo.getDevice(device.id);
  assert(recovered?.status === "reachable", "status updated to reachable");
  assert(recovered?.lastSuccessAt !== null, "lastSuccessAt set on success");

  console.log("\n--- 4. Setting capabilities ---");
  await repo.setCapabilities(device.id, "rest", {
    capabilities: ["diagnostics"],
  });
  const discovered = await repo.getDevice(device.id);
  assert(discovered?.protocol === "rest", "protocol persisted");
  assert(discovered?.capabilities !== null, "capabilities persisted as jsonb");

  console.log("\n--- 5. Recording diagnostics ---");
  await repo.recordDiagnostics(device.id, {
    hwVersion: "HW-1.0",
    swVersion: "SW-2.1",
    fwVersion: "FW-3.0",
    deviceReportedStatus: "ok",
    checksum: null, // the real production value until the binary exists
  });
  const first = await repo.latestDiagnostics(device.id);
  assert(first?.hwVersion === "HW-1.0", "diagnostics round-trip hwVersion");
  assert(first?.deviceReportedStatus === "ok", "device-reported status stored");
  assert(first?.checksum === null, "null checksum stored as null, not faked");

  // A second snapshot proves diagnostics are append-only history, and
  // that latestDiagnostics really returns the newest row rather than
  // whichever one the database happened to return first.
  await repo.recordDiagnostics(device.id, {
    hwVersion: "HW-1.0",
    swVersion: "SW-2.2",
    fwVersion: "FW-3.1",
    deviceReportedStatus: "degraded",
    checksum: "abc123",
  });
  const latest = await repo.latestDiagnostics(device.id);
  assert(
    latest?.swVersion === "SW-2.2",
    "latestDiagnostics returns the newest row",
  );
  assert(
    latest?.deviceReportedStatus === "degraded",
    "newest device-reported status returned",
  );
  assert(latest?.checksum === "abc123", "checksum round-trips when present");

  console.log("\n--- 6. Deleting, and cascade ---");
  const deleted = await repo.deleteDevice(device.id);
  assert(deleted === true, "deleteDevice reports success");
  assert((await repo.getDevice(device.id)) === null, "device is gone");

  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM diagnostics WHERE device_id = $1",
    [device.id],
  );
  assert(rows[0].n === 0, "its diagnostics were cascade-deleted");

  const deletedAgain = await repo.deleteDevice(device.id);
  assert(deletedAgain === false, "deleting a missing device returns false");
}

runTests()
  .then(async () => {
    console.log(`\n${checks} checks passed\n`);
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(
      "\nFAILED:",
      error instanceof Error ? error.message : error,
    );
    await pool.end().catch(() => {});
    // Non-zero exit is the entire point. A test that logs a failure but
    // exits 0 is invisible to CI, to `docker compose run`, and to
    // anyone chaining commands with &&.
    process.exit(1);
  });
