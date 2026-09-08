// rest/http/server.ts
import express from 'express';
import { Pool } from 'pg';
import { SQLService } from '../../datasource-module/datasource/sql-service';
import { MonitoringService, DuplicateDeviceError, DeviceNotFoundError } from '../service/monitoringService';
import { logger } from '../domain/logger'; // <-- Import your custom logger

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'poc',
  password: process.env.DB_PASSWORD || 'poc',
  database: process.env.DB_NAME || 'poc'
});

const sqlService = new SQLService(pool);
// Pass the structured logger here instead of console
const monitoringService = new MonitoringService(sqlService, logger);

const app = express();
app.use(express.json());

app.get('/devices', async (req, res) => {
  const devices = await monitoringService.listDevices();
  res.json(devices);
});

app.post('/devices', async (req, res) => {
  try {
    const device = await monitoringService.registerDevice(req.body);
    res.status(201).json(device);
  } catch (error: any) {
    if (error instanceof DuplicateDeviceError) {
      res.status(409).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.get('/devices/:id', async (req, res) => {
  try {
    const result = await monitoringService.getDeviceWithDiagnostics(req.params.id);
    res.json(result);
  } catch (error: any) {
    if (error instanceof DeviceNotFoundError) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.delete('/devices/:id', async (req, res) => {
  try {
    await monitoringService.removeDevice(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    if (error instanceof DeviceNotFoundError) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info(`REST API listening on port ${port}`);
});
