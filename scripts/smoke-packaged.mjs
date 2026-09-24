#!/usr/bin/env node
/**
 * Unattended packaged-app smoke. Always exits.
 * 1) Starts the unpacked server bundle, probes health + toolkit, kills it.
 * 2) Optionally launches SpectraDesk.exe with SPECTRA_SMOKE=1 (self-quit).
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readdirSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const unpacked = path.join(root, "desktop", "release", "win-unpacked");
const serverEntry = path.join(unpacked, "resources", "server", "dist", "index.js");
const clientDist = path.join(unpacked, "resources", "client-dist");
const pwRoot = path.join(unpacked, "resources", "ms-playwright");
const VERSION = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;

function fail(msg) {
  console.error("[smoke] FAIL:", msg);
  process.exit(1);
}

function pickPort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

async function fetchJson(url, timeoutMs = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

async function fetchJsonPost(url, body) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    return { status: res.status, json: await res.json() };
  } finally {
    clearTimeout(t);
  }
}

function killTree(proc) {
  if (!proc || proc.killed || proc.exitCode !== null) return;
  const pid = proc.pid;
  if (process.platform === "win32" && pid) {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    proc.kill("SIGKILL");
  }
}

function spawnLogged(cmd, args, opts) {
  const proc = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout?.on("data", (b) => process.stdout.write(b));
  proc.stderr?.on("data", (b) => process.stderr.write(b));
  return proc;
}

async function waitHealth(port, timeoutMs) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetchJson(`http://127.0.0.1:${port}/api/health`, 2000);
      last = r.text;
      if (r.status === 200 && r.json?.ok) return r.json;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`health timeout. last=${last.slice(0, 400)}`);
}

async function smokeEngine() {
  if (!existsSync(serverEntry)) fail(`missing unpacked server: ${serverEntry}. Run npm run dist:win`);
  const port = await pickPort();
  const env = {
    ...process.env,
    PORT: String(port),
    SPECTRA_HOST: "127.0.0.1",
    SPECTRA_STATIC_DIR: clientDist,
    SPECTRA_DESKTOP: "1",
    SPECTRA_LOG_LEVEL: "warn",
    PLAYWRIGHT_BROWSERS_PATH: pwRoot,
    PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL: "0",
  };
  try {
    for (const name of readdirSync(pwRoot)) {
      if (!/^chromium-\d+$/i.test(name)) continue;
      const chrome = path.join(pwRoot, name, "chrome-win64", "chrome.exe");
      if (existsSync(chrome)) env.SPECTRA_CHROMIUM_PATH = chrome;
    }
  } catch {
    /* optional */
  }

  console.log("[smoke] engine on port", port);
  const proc = spawnLogged(process.execPath, [serverEntry], {
    cwd: path.join(unpacked, "resources", "server"),
    env,
    windowsHide: true,
  });

  try {
    const health = await waitHealth(port, 45_000);
    console.log("[smoke] health", JSON.stringify(health));
    if (health.version !== VERSION) fail(`health version ${health.version} != package ${VERSION}`);
    if (!health.chromiumOk) fail("chromiumOk=false in packaged health");
    if (!(health.toolkitCount >= 800)) fail(`toolkitCount ${health.toolkitCount}`);

    const ui = await fetchJson(`http://127.0.0.1:${port}/`, 8000);
    if (ui.status !== 200 || !/Spectra/i.test(ui.text)) fail("static UI did not load");

    const stats = await fetchJson(`http://127.0.0.1:${port}/api/toolkit/stats`, 8000);
    if (stats.status !== 200 || !(stats.json?.toolCount >= 800)) fail("toolkit stats");

    const iban = await fetchJsonPost(`http://127.0.0.1:${port}/api/toolkit/iban`, {
      iban: "GB82WEST12345698765432",
    });
    if (iban.status !== 200 || iban.json?.isValid !== true) {
      fail(`iban probe ${iban.status} ${JSON.stringify(iban.json)}`);
    }

    console.log("[smoke] engine OK");
    return health;
  } finally {
    killTree(proc);
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function smokeElectron() {
  const exeCandidates = [
    path.join(unpacked, "SpectraDesk.exe"),
    path.join(unpacked, "Spectra Desk.exe"),
  ];
  const exe = exeCandidates.find((p) => existsSync(p));
  if (!exe) {
    console.log("[smoke] skip electron (exe missing)");
    return;
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), "spectra-smoke-"));
  const marker = path.join(dir, "ok.json");
  console.log("[smoke] electron", exe);
  let out = "";
  const proc = spawn(exe, [], {
    cwd: unpacked,
    env: {
      ...process.env,
      SPECTRA_SMOKE: "1",
      SPECTRA_LICENSE_SKIP: "1",
      SPECTRA_SMOKE_MARKER: marker,
      SPECTRA_LOG_LEVEL: "warn",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.on("data", (b) => {
    const s = b.toString("utf8");
    out += s;
    process.stdout.write(s);
  });
  proc.stderr?.on("data", (b) => {
    const s = b.toString("utf8");
    out += s;
    process.stderr.write(s);
  });

  const timeoutMs = 90_000;
  const started = Date.now();
  try {
    while (Date.now() - started < timeoutMs) {
      if (existsSync(marker) || /SPECTRA_SMOKE_OK/.test(out)) {
        console.log("[smoke] electron OK");
        try {
          if (existsSync(marker)) console.log("[smoke] marker", readFileSync(marker, "utf8"));
        } catch {
          /* ignore */
        }
        return;
      }
      if (proc.exitCode !== null) {
        if (existsSync(marker) || (/SPECTRA_SMOKE_OK/.test(out) && proc.exitCode === 0)) return;
        fail(`electron exited ${proc.exitCode}\n${out.slice(-1500)}`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    fail(`electron smoke timeout\n${out.slice(-1500)}`);
  } finally {
    killTree(proc);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function main() {
  console.log("[smoke] Spectra Desk", VERSION);
  await smokeEngine();
  if (process.env.SPECTRA_SMOKE_SKIP_ELECTRON === "1") {
    console.log("[smoke] skip electron (SPECTRA_SMOKE_SKIP_ELECTRON=1)");
  } else {
    await smokeElectron();
  }
  console.log("[smoke] PASS");
}

main().catch((err) => fail(err instanceof Error ? err.stack || err.message : String(err)));
