export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_PRIO: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function ts(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, msg: string, meta?: unknown) {
  if (LEVEL_PRIO[level] > LEVEL_PRIO[currentLevel]) return;
  const prefix = `[${ts()}] [${level.toUpperCase()}]`;
  if (meta !== undefined) {
    console.log(`${prefix} ${msg}`, meta);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

export const logger = {
  error: (msg: string, meta?: unknown) => log("error", msg, meta),
  warn: (msg: string, meta?: unknown) => log("warn", msg, meta),
  info: (msg: string, meta?: unknown) => log("info", msg, meta),
  debug: (msg: string, meta?: unknown) => log("debug", msg, meta),
};
