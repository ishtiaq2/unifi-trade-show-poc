type Level = "info" | "warn" | "error";

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };

  // Stringify the JSON, then un-escape the ANSI codes so the terminal renders them!
  const line = JSON.stringify(payload).replace(/\\u001b/g, '\x1b');

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
