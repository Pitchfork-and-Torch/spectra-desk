/**
 * Origins this desk already uses.
 * Electron loads http://127.0.0.1:<port>/ where port is 3847 plus the
 * free-port span (32). Vite dev is http://localhost:5173 (and 127.0.0.1).
 * The Vite proxy target is http://localhost:3847.
 */
const DEV_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://localhost:3847",
]);

const ELECTRON_PORT_MIN = 3847;
const ELECTRON_PORT_SPAN = 32;

export function isLocalAppOrigin(origin: string): boolean {
  if (DEV_ORIGINS.has(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (url.protocol !== "http:") return false;
  if (url.hostname !== "127.0.0.1") return false;
  const port = Number(url.port);
  if (!Number.isInteger(port)) return false;
  return port >= ELECTRON_PORT_MIN && port < ELECTRON_PORT_MIN + ELECTRON_PORT_SPAN;
}
