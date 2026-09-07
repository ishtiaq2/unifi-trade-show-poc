Run this single block of code in your terminal from the directory directly above your `devices` folder. It will automatically create the `monitoring-service` directory, build the folder structure, and write all the code into the correct files without you having to open an editor.

```bash
mkdir -p monitoring-service/src
cd monitoring-service

cat << 'EOF' > docker-compose.yml
version: '3.8'

networks:
  unifi-net:
    external: true

services:
  postgres:
    image: postgres:16-alpine
    container_name: nms-postgres
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
      POSTGRES_DB: nms
    ports:
      - "5432:5432"
    networks:
      - unifi-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d nms"]
      interval: 5s
      timeout: 5s
      retries: 5

  nms-app:
    build: .
    container_name: nms-app
    environment:
      DB_HOST: postgres
      DB_USER: admin
      DB_PASSWORD: password
      DB_NAME: nms
      POLL_INTERVAL_MS: 5000
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - unifi-net
EOF

cat << 'EOF' > package.json
{
  "name": "monitoring-service",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.11.1",
    "@grpc/proto-loader": "^0.7.13",
    "express": "^4.19.2",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.6",
    "typescript": "^5.5.0"
  }
}
EOF

cat << 'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
EOF

cat << 'EOF' > Dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY src/device.proto ./dist/device.proto

EXPOSE 3000
CMD ["node", "dist/index.js"]
EOF

cat << 'EOF' > src/device.proto
syntax = "proto3";
package device;

service DeviceService {
  rpc getHealth (Empty) returns (HealthResponse);
  rpc getDiagnostics (Empty) returns (DiagnosticsResponse);
}

message Empty {}

message HealthResponse {
  string protocol = 1;
  repeated string capabilities = 2;
  string deviceName = 3;
}

message DiagnosticsResponse {
  string hwVersion = 1;
  string swVersion = 2;
  string fwVersion = 3;
  string status = 4;
}
EOF

cat << 'EOF' > src/index.ts
import express from 'express';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// --- Configuration & Inventory ---
const INVENTORY = [
  { id: 'router', type: 'rest', host: 'router', port: 4001 },
  { id: 'switch', type: 'rest', host: 'switch', port: 4002 },
  { id: 'camera-rest', type: 'rest', host: 'camera-rest', port: 4003 },
  { id: 'door-access-rest', type: 'rest', host: 'door-access-rest', port: 4004 },
  { id: 'camera-grpc', type: 'grpc', host: 'camera-grpc', port: 4005 },
  { id: 'door-access-grpc', type: 'grpc', host: 'door-access-grpc', port: 4006 }
];

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000');
const MAX_FAILURES = 3; 

// State machine tracker for transient failures
const failureTracker: Record<string, number> = {};

// --- Database Setup ---
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'nms'
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_health (
      device_id VARCHAR(50) PRIMARY KEY,
      reachability VARCHAR(20) NOT NULL,
      device_status VARCHAR(50),
      hw_version VARCHAR(50),
      sw_version VARCHAR(50),
      fw_version VARCHAR(50),
      checksum VARCHAR(64),
      last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Database initialized.");
}

// --- gRPC Client Setup ---
const PROTO_PATH = path.join(__dirname, 'device.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, { keepCase: false, defaults: true });
const proto = (grpc.loadPackageDefinition(packageDefinition) as any).device;

function fetchGrpcDiagnostics(host: string, port: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = new proto.DeviceService(`${host}:${port}`, grpc.credentials.createInsecure());
    client.getDiagnostics({}, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// --- Polling Engine ---
function generateChecksum(data: any): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

async function pollDevice(device: typeof INVENTORY[0]) {
  try {
    let payload: any;

    if (device.type === 'rest') {
      const res = await fetch(`http://${device.host}:${device.port}/diagnostics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = await res.json();
    } else {
      payload = await fetchGrpcDiagnostics(device.host, device.port);
    }

    // Success: Reset failure count and mark reachable
    failureTracker[device.id] = 0;
    const checksum = generateChecksum(payload);

    await pool.query(`
      INSERT INTO device_health (device_id, reachability, device_status, hw_version, sw_version, fw_version, checksum, last_checked)
      VALUES ($1, 'reachable', $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (device_id) DO UPDATE SET
        reachability = EXCLUDED.reachability,
        device_status = EXCLUDED.device_status,
        hw_version = EXCLUDED.hw_version,
        sw_version = EXCLUDED.sw_version,
        fw_version = EXCLUDED.fw_version,
        checksum = EXCLUDED.checksum,
        last_checked = EXCLUDED.last_checked
    `, [device.id, payload.status, payload.hwVersion, payload.swVersion, payload.fwVersion, checksum]);

    console.log(`[${device.id}] Reachable | Status: ${payload.status}`);

  } catch (error: any) {
    // Failure: Increment counter to determine Suspect vs Unreachable
    failureTracker[device.id] = (failureTracker[device.id] || 0) + 1;
    const isHardDown = failureTracker[device.id] >= MAX_FAILURES;
    const reachability = isHardDown ? 'unreachable' : 'suspect';

    await pool.query(`
      INSERT INTO device_health (device_id, reachability, last_checked)
      VALUES ($1, $2, NOW())
      ON CONFLICT (device_id) DO UPDATE SET
        reachability = EXCLUDED.reachability,
        last_checked = EXCLUDED.last_checked
    `, [device.id, reachability]);

    console.log(`[${device.id}] ${reachability.toUpperCase()} | Attempt ${failureTracker[device.id]}`);
  }
}

async function startPolling() {
  console.log(`Starting polling engine (Interval: ${POLL_INTERVAL}ms)...`);
  setInterval(() => {
    INVENTORY.forEach(device => pollDevice(device));
  }, POLL_INTERVAL);
}

// --- Express API ---
const app = express();
app.get('/api/devices', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM device_health ORDER BY device_id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed' });
  }
});

// --- Boot ---
async function bootstrap() {
  await initDB();
  await startPolling();
  app.listen(3000, () => console.log('NMS API listening on port 3000. View status at http://localhost:3000/api/devices'));
}

bootstrap().catch(console.error);
EOF

```

To start the system, execute this command from within the newly created `monitoring-service` folder:

```bash
podman-compose up -d --build

```

You can watch the logs using `podman logs -f nms-app` or hit `curl http://localhost:3000/api/devices` to see the results.
