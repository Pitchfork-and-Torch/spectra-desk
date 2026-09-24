import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const LICENSE_API_CANDIDATES = [
  process.env.SPECTRA_LICENSE_API_URL,
  "https://license.jonbailey.xyz/api/validate",
  "https://spectra-desk-license.pitchfork-and-torch.workers.dev/api/validate",
].filter((u): u is string => Boolean(u));

const SUBSCRIBE_URL =
  process.env.SPECTRA_SUBSCRIBE_URL || "https://license.jonbailey.xyz/subscribe";
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredLicense {
  email: string;
  licenseKey: string;
  token: string;
  validatedAt: string;
  expiresAt?: string | null;
}

function licensePath(): string {
  return path.join(app.getPath("userData"), "license.json");
}

function machineId(): string {
  const base = `${app.getPath("userData")}|${process.platform}|${process.arch}`;
  return createHash("sha256").update(base).digest("hex").slice(0, 16);
}

export function readStoredLicense(): StoredLicense | null {
  const file = licensePath();
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as StoredLicense;
  } catch {
    return null;
  }
}

function saveLicense(data: StoredLicense): void {
  const file = licensePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

async function validateOnline(email: string, licenseKey: string): Promise<StoredLicense> {
  let lastError = "License validation failed";
  for (const url of LICENSE_API_CANDIDATES) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, licenseKey, machineId: machineId() }),
      });
      const data = (await res.json()) as {
        valid?: boolean;
        token?: string;
        expiresAt?: string | null;
        error?: string;
      };
      if (!res.ok || !data.valid || !data.token) {
        lastError = data.error || `License validation failed (${res.status})`;
        continue;
      }
      return {
        email,
        licenseKey,
        token: data.token,
        validatedAt: new Date().toISOString(),
        expiresAt: data.expiresAt ?? null,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError);
}

function isGraceValid(stored: StoredLicense): boolean {
  const validated = new Date(stored.validatedAt).getTime();
  if (Date.now() - validated > OFFLINE_GRACE_MS) return false;
  if (stored.expiresAt && new Date(stored.expiresAt) < new Date()) return false;
  return Boolean(stored.token);
}

export async function ensureLicensed(): Promise<boolean> {
  if (process.env.SPECTRA_LICENSE_SKIP === "1") return true;

  const stored = readStoredLicense();
  if (stored) {
    try {
      const fresh = await validateOnline(stored.email, stored.licenseKey);
      saveLicense(fresh);
      return true;
    } catch {
      if (isGraceValid(stored)) return true;
    }
  }

  return showActivationDialog();
}

function showActivationDialog(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const win = new BrowserWindow({
      width: 480,
      height: 520,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: "Activate Spectra Desk",
      backgroundColor: "#06080f",
      webPreferences: {
        preload: path.join(__dirname, "license-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const activateHandler = async (
      _evt: Electron.IpcMainInvokeEvent,
      payload: { email: string; licenseKey: string },
    ) => {
      try {
        const saved = await validateOnline(
          payload.email.trim().toLowerCase(),
          payload.licenseKey.trim().toUpperCase(),
        );
        saveLicense(saved);
        win.close();
        finish(true);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    };

    ipcMain.handle("license:activate", activateHandler);
    ipcMain.handle("license:open-subscribe", () => shell.openExternal(SUBSCRIBE_URL));

    ipcMain.once("license:cancel", () => {
      win.close();
      finish(false);
    });

    win.on("closed", () => {
      ipcMain.removeHandler("license:activate");
      ipcMain.removeHandler("license:open-subscribe");
      finish(false);
    });

    win.loadFile(path.join(__dirname, "..", "assets", "activate.html"));
  });
}