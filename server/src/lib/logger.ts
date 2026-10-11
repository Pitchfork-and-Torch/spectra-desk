type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function currentLevel(): LogLevel {
  const env = process.env.SPECTRA_LOG_LEVEL?.toLowerCase();
  if (env === "debug" || env === "info" || env === "warn" || env === "error") return env;
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

function emit(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta ? { meta } : {}),
  };
  const line = JSON.stringify(entry);
  const validationMode = process.env.SPECTRA_VALIDATION === "1";
  // MCP stdio is stdout-only JSON-RPC. Never write logs there.
  if (validationMode) {
    console.log(line);
    return;
  }
  process.stderr.write(line + "\n");
}

export const log = {
  debug: (scope: string, message: string, meta?: Record<string, unknown>) => emit("debug", scope, message, meta),
  info: (scope: string, message: string, meta?: Record<string, unknown>) => emit("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) => emit("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: Record<string, unknown>) => emit("error", scope, message, meta),
};