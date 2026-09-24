#!/usr/bin/env node
/**
 * Stage server, client UI, and Playwright Chromium for electron-builder extraResources.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(__dirname, "..");
const root = path.join(desktopDir, "..");
const resourcesDir = path.join(desktopDir, "resources");
const serverRes = path.join(resourcesDir, "server");
const clientRes = path.join(resourcesDir, "client-dist");
const pwRes = path.join(resourcesDir, "ms-playwright");
const assetsDir = path.join(desktopDir, "assets");

async function rmDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

async function copyDir(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true, force: true });
}

async function buildIcon() {
  const iconScript = path.join(__dirname, "build-icon.mjs");
  if (!existsSync(iconScript)) return;
  execSync(`node "${iconScript}"`, { stdio: "inherit" });
}

async function main() {
  const serverDist = path.join(root, "server", "dist");
  const clientDist = path.join(root, "client", "dist");

  if (!existsSync(serverDist)) {
    console.error("[prepare] server/dist missing. Run: npm run build --prefix server");
    process.exit(1);
  }
  if (!existsSync(clientDist)) {
    console.error("[prepare] client/dist missing. Run: npm run build --prefix client");
    process.exit(1);
  }

  console.log("[prepare] staging resources →", resourcesDir);
  await rmDir(resourcesDir);
  await fs.mkdir(serverRes, { recursive: true });

  await copyDir(serverDist, path.join(serverRes, "dist"));
  await fs.copyFile(path.join(root, "server", "package.json"), path.join(serverRes, "package.json"));
  await fs.copyFile(path.join(root, "server", "package-lock.json"), path.join(serverRes, "package-lock.json"));

  console.log("[prepare] npm ci --omit=dev (server bundle)…");
  execSync("npm.cmd ci --omit=dev", {
    cwd: serverRes,
    stdio: "inherit",
    env: { ...process.env, npm_config_ignore_scripts: "false" },
  });

  // Fail fast if critical runtime deps missing
  const required = [
    path.join(serverRes, "node_modules", "@hono", "node-server"),
    path.join(serverRes, "node_modules", "hono"),
    path.join(serverRes, "node_modules", "zod"),
  ];
  for (const p of required) {
    if (!existsSync(p)) {
      console.error("[prepare] ERROR: missing required dependency after npm ci:", p);
      process.exit(1);
    }
  }
  console.log("[prepare] server runtime deps verified (@hono/node-server, hono, zod)");

  console.log("[prepare] Playwright Chromium →", pwRes);
  await fs.mkdir(pwRes, { recursive: true });
  execSync("npx.cmd playwright install chromium", {
    cwd: serverRes,
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: pwRes },
  });

  await copyDir(clientDist, clientRes);
  await buildIcon();

  console.log("[prepare] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});