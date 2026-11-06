// Minimal structured logger. One JSON line per event in production, readable text in development.
// Never pass secrets, tokens, passwords or full request bodies to it.
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  if (configured && configured in ORDER) return ORDER[configured];
  return process.env.NODE_ENV === "production" ? ORDER.info : ORDER.debug;
}

function emit(level: Level, message: string): void {
  if (ORDER[level] < threshold()) return;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (process.env.NODE_ENV === "production") {
    sink(JSON.stringify({ level, time: new Date().toISOString(), message }));
  } else {
    sink(`[${level}] ${message}`);
  }
}

export const logger = {
  debug: (message: string) => emit("debug", message),
  info: (message: string) => emit("info", message),
  warn: (message: string) => emit("warn", message),
  error: (message: string) => emit("error", message),
};
