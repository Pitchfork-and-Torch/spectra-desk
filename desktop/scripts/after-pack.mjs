/**
 * electron-builder excludes node_modules from extraResources by default.
 * Copy production server deps into the packaged app after pack.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function afterPack(context) {
  const desktopDir = path.join(__dirname, "..");
  const srcNm = path.join(desktopDir, "resources", "server", "node_modules");
  const appOut = context.appOutDir; // e.g. release/win-unpacked
  const destServer = path.join(appOut, "resources", "server");
  const destNm = path.join(destServer, "node_modules");

  if (!existsSync(srcNm)) {
    console.error("[afterPack] ERROR: staging node_modules missing at", srcNm);
    console.error("[afterPack] Run prepare:resources before dist.");
    process.exitCode = 1;
    return;
  }

  console.log("[afterPack] copying server node_modules →", destNm);
  await fs.mkdir(destServer, { recursive: true });
  await fs.rm(destNm, { recursive: true, force: true });
  await fs.cp(srcNm, destNm, { recursive: true, force: true });

  // Sanity: critical packages must exist
  const required = [
    path.join(destNm, "@hono", "node-server"),
    path.join(destNm, "hono"),
    path.join(destNm, "zod"),
  ];
  for (const p of required) {
    if (!existsSync(p)) {
      console.error("[afterPack] ERROR: missing required package after copy:", p);
      process.exitCode = 1;
      return;
    }
  }
  console.log("[afterPack] server dependencies OK (@hono/node-server, hono, zod)");
}
