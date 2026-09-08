// src/server.ts
import express from 'express';
import { pool } from './datasource/postgres';

const app = express();
const port = process.env.PORT || 3000;

// Boot verification endpoint
app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', database: error.message });
  }
});

const server = app.listen(port, () => {
  console.log(`Monitoring service booted and listening on port ${port}`);
});

// Graceful Shutdown Sequence
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  server.close(() => {
    console.log('HTTP server closed.');
  });

  await pool.end();
  console.log('Database connection pool closed.');

  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
