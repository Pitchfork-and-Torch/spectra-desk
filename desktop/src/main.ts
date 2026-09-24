import {
  app,
  BrowserWindow,
  Menu,
  shell,
  dialog,
  ipcMain,
  screen,
  type MenuItemConstructorOptions,
} from "electron";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { pickFreePort } from "./free-port.js";

/** Always from package.json so installers and About match the release being built. */
function readAppVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
      if (pkg.version) return pkg.version;
    }
  } catch {
    /* fall through */
  }
  return "10.0.0";
}
const APP_VERSION = readAppVersion();
const DEFAULT_PORT = 3847;
const HEALTH_TIMEOUT_MS = 90_000;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let serverProc: ChildProcess | null = null;
let serverPort = DEFAULT_PORT;

function resourcesRoot(): string {
  if (app.isPackaged) return process.resourcesPath;
  return path.join(__dirname, "..", "resources");
}

function casesFolder(): string {
  const home = process.env.USERPROFILE || process.env.HOME || app.getPath("home");
  return path.join(home, ".spectra-desk", "cases");
}

function startServer(port: number): Promise<{ port: number; health: Record<string, unknown> }> {
  const root = resourcesRoot();
  const serverDir = path.join(root, "server");
  const clientDist = path.join(root, "client-dist");
  const playwrightBrowsers = path.join(root, "ms-playwright");
  const serverEntry = path.join(serverDir, "dist", "index.js");

  if (!existsSync(serverEntry)) {
    throw new Error(`Server bundle missing: ${serverEntry}. Run npm run prepare:resources --prefix desktop`);
  }

  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      SPECTRA_HOST: "127.0.0.1",
      SPECTRA_STATIC_DIR: clientDist,
      SPECTRA_DESKTOP: "1",
      PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsers,
      // Env alone is insufficient on Playwright 1.52+ (still launches headless_shell).
      // Server launchChromium() resolves full chrome.exe via executablePath.
      PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL: "0",
      SPECTRA_LOG_LEVEL: process.env.SPECTRA_LOG_LEVEL || "info",
    };

    // Prefer explicit path if full Chromium is present (helps server resolve before import quirks).
    const chromeCandidates: string[] = [];
    try {
      for (const name of readdirSync(playwrightBrowsers)) {
        if (!/^chromium-\d+$/i.test(name)) continue;
        chromeCandidates.push(
          path.join(playwrightBrowsers, name, "chrome-win64", "chrome.exe"),
          path.join(playwrightBrowsers, name, "chrome-win", "chrome.exe"),
        );
      }
    } catch {
      /* optional */
    }
    const chromeExe = chromeCandidates.find((p) => existsSync(p));
    if (chromeExe) env.SPECTRA_CHROMIUM_PATH = chromeExe;

    const proc = spawn(process.execPath, [serverEntry], {
      env,
      cwd: serverDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    serverProc = proc;

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });

    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code !== null && code !== 0 && mainWindow) {
        dialog.showErrorBox(
          "Spectra Desk engine stopped",
          `The investigation engine exited unexpectedly (code ${code}).\n\n${stderr.slice(-1200)}`,
        );
      }
    });

    waitForHealth(port, HEALTH_TIMEOUT_MS)
      .then((health) => resolve({ port, health }))
      .catch((err) => {
        serverProc?.kill();
        reject(new Error(`${err instanceof Error ? err.message : String(err)}\n${stderr.slice(-1200)}`));
      });
  });
}

function waitForHealth(port: number, timeoutMs: number): Promise<Record<string, unknown>> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode === 200) {
            try {
              const json = JSON.parse(body) as Record<string, unknown>;
              if (json.ok === true && typeof json.version === "string") {
                resolve(json);
                return;
              }
            } catch {
              /* retry */
            }
          }
          if (Date.now() - started > timeoutMs) reject(new Error("API health check timed out"));
          else setTimeout(tick, 350);
        });
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("API health check timed out"));
        else setTimeout(tick, 350);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    setTimeout(tick, 400);
  });
}

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: "#06080f",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, "..", "assets", "loading.html"));
  splashWindow.once("ready-to-show", () => splashWindow?.show());
}

function createMainWindow(port: number): void {
  const work = screen.getPrimaryDisplay().workArea;
  mainWindow = new BrowserWindow({
    x: work.x,
    y: work.y,
    width: Math.max(work.width, 1200),
    height: Math.max(work.height, 800),
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#06080f",
    title: "Spectra Desk",
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.once("ready-to-show", () => {
    splashWindow?.close();
    splashWindow = null;
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Cases Folder",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => shell.openPath(casesFolder()),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Spectra Desk",
          click: async () => {
            const { response } = await dialog.showMessageBox({
              type: "info",
              title: "About Spectra Desk",
              message: `Spectra Desk v${APP_VERSION}`,
              detail:
                "Created by Pitchfork-and-Torch\nGitHub: github.com/Pitchfork-and-Torch\nX: x.com/suddenlyjon\n\nPublic sources only. Not legal proof of identity.\nData: %USERPROFILE%\\.spectra-desk\\",
              buttons: ["GitHub", "X / @suddenlyjon", "OK"],
              defaultId: 2,
              cancelId: 2,
              noLink: false,
            });
            if (response === 0) shell.openExternal("https://github.com/Pitchfork-and-Torch");
            if (response === 1) shell.openExternal("https://x.com/suddenlyjon");
          },
        },
        {
          label: "Pitchfork-and-Torch on GitHub",
          click: () => shell.openExternal("https://github.com/Pitchfork-and-Torch"),
        },
        {
          label: "X / @suddenlyjon",
          click: () => shell.openExternal("https://x.com/suddenlyjon"),
        },
        {
          label: "Operator Guide",
          click: () => {
            const packed = path.join(resourcesRoot(), "docs", "OPERATOR-GUIDE.md");
            const dev = path.join(__dirname, "..", "..", "docs", "v8", "OPERATOR-GUIDE.md");
            const guide = existsSync(packed) ? packed : dev;
            if (existsSync(guide)) shell.openPath(guide);
            else shell.openExternal("https://github.com/Pitchfork-and-Torch/spectra-desk");
          },
        },
        {
          label: "Product repo",
          click: () => shell.openExternal("https://github.com/Pitchfork-and-Torch/spectra-desk"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function stopServer(): void {
  if (!serverProc) return;
  const proc = serverProc;
  serverProc = null;
  proc.kill("SIGTERM");
  setTimeout(() => {
    if (!proc.killed) proc.kill("SIGKILL");
  }, 4000);
}

const SMOKE = process.env.SPECTRA_SMOKE === "1";
const gotLock = SMOKE ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const smoke = SMOKE;

    try {
      serverPort = await pickFreePort(DEFAULT_PORT);
      if (smoke) {
        const started = await startServer(serverPort);
        const line = `SPECTRA_SMOKE_OK ${JSON.stringify(started.health)}\n`;
        process.stdout.write(line);
        const marker = process.env.SPECTRA_SMOKE_MARKER;
        if (marker) writeFileSync(marker, JSON.stringify({ ok: true, ...started.health }, null, 2), "utf8");
        app.quit();
        return;
      }

      buildMenu();
      createSplash();
      await startServer(serverPort);
      createMainWindow(serverPort);
    } catch (err) {
      splashWindow?.close();
      if (!smoke) {
        dialog.showErrorBox(
          "Spectra Desk failed to start",
          err instanceof Error ? err.message : String(err),
        );
      } else {
        process.stderr.write(`SPECTRA_SMOKE_FAIL ${err instanceof Error ? err.message : String(err)}\n`);
      }
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => stopServer());

  ipcMain.handle("open-cases-folder", () => shell.openPath(casesFolder()));
  ipcMain.handle("get-version", () => APP_VERSION);
}
