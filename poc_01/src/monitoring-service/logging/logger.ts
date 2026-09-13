// unifi-products-demo/src/monitoring-service/logging/logger.ts

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * Transforms "2026-09-13T15:01:13.935Z" into "2026-09-13 15:01:13"
 */
function getFormattedTime(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

// Terminal ANSI Color Codes
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[90m",
  info: "\x1b[32m",  // Green
  warn: "\x1b[33m",  // Yellow
  error: "\x1b[31m", // Red
};

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";

  // Converts { port: 3000, active: true } into "port=3000 active=true"
  const formattedPairs = Object.entries(meta)
    .map(([key, value]) => `${key}=${value}`)
    .join("  ");

  return ` ${c.dim}|  ${formattedPairs}${c.reset}`;
}

export const logger: Logger = {
  info(msg, meta) {
    console.log(`${c.dim}${getFormattedTime()}${c.reset} ${c.info}[INFO]${c.reset}  ${msg}${formatMeta(meta)}`);
  },

  warn(msg, meta) {
    console.log(`${c.dim}${getFormattedTime()}${c.reset} ${c.warn}[WARN]${c.reset}  ${msg}${formatMeta(meta)}`);
  },

  error(msg, meta) {
    console.error(`${c.dim}${getFormattedTime()}${c.reset} ${c.error}[ERROR]${c.reset} ${msg}${formatMeta(meta)}`);
  }
};

/** For tests that don't care about log output. */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
