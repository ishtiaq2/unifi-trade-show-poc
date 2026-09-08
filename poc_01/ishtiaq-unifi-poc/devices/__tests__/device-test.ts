// test-rest.ts

const restDevices = [
  { name: 'router', port: 4001 },
  { name: 'switch', port: 4002 },
  { name: 'camera-rest', port: 4003 },
  { name: 'door-access-rest', port: 4004 }
];

async function testRestDevices() {
  console.log("Starting standalone REST device connectivity tests...\n");

  for (const device of restDevices) {
    // We use localhost here because we are running from the host machine,
    // not from inside the unifi-net container network.
    console.log(`--- Testing ${device.name} (http://localhost:${device.port}) ---`);

    try {
      const healthRes = await fetch(`http://localhost:${device.port}/health`);
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      const healthData = await healthRes.json();
      console.log(`  ✅ /health:`, healthData);

      const diagRes = await fetch(`http://localhost:${device.port}/diagnostics`);
      if (!diagRes.ok) throw new Error(`HTTP ${diagRes.status}`);
      const diagData = await diagRes.json();
      console.log(`  ✅ /diagnostics:`, diagData);

    } catch (error: any) {
      console.error(`  ❌ Connection failed:`, error.message);
    }

    console.log("");
  }
}

testRestDevices();
