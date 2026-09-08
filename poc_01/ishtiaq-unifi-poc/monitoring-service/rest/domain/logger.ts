// rest/domain/logger.ts

type Level = "info" | "warn" | "error";

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  // Single-line JSON. The brief says this PoC "might become part of
  // something bigger" — structured logs survive that transition into a
  // real log aggregator, whereas free-text console.log has to be
  // rewritten. Hand-rolled rather than pulling in pino/winston: one
  // function is enough here, and a PoC shouldn't take a dependency it
  // doesn't need.
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger: Logger = {
  info: (msg, meta) => emit("info", msg, meta),
  warn: (msg, meta) => emit("warn", msg, meta),
  error: (msg, meta) => emit("error", msg, meta),
};

/** Silent logger for tests that don't care about output. */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
