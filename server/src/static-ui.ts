import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { log } from "./lib/logger.js";

/** Serve the built Vite client when SPECTRA_STATIC_DIR is set (desktop / single-port prod). */
export function mountStaticUi(app: Hono): boolean {
  const staticDir = process.env.SPECTRA_STATIC_DIR;
  if (!staticDir) return false;

  const indexPath = path.join(staticDir, "index.html");
  if (!existsSync(indexPath)) {
    log.warn("api", "SPECTRA_STATIC_DIR set but index.html missing", { staticDir });
    return false;
  }

  app.use("/assets/*", serveStatic({ root: staticDir }));
  app.use("/favicon.svg", serveStatic({ root: staticDir }));
  app.use("/spectra-ghost.svg", serveStatic({ root: staticDir }));
  app.get("/", serveStatic({ path: "index.html", root: staticDir }));

  app.notFound((c) => {
    if (c.req.path.startsWith("/api")) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.html(readFileSync(indexPath, "utf8"));
  });

  log.info("api", "Serving UI from static dir", { staticDir });
  return true;
}