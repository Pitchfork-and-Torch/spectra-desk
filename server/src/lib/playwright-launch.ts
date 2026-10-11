/**
 * Shared Chromium launch for Spectra Desk.
 *
 * Playwright 1.49+ defaults *headless* launches to `chromium_headless_shell`
 * even when PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL=0 (verified broken on 1.52+).
 * The desktop package ships full Chromium (`chromium-*`) and excludes the
 * headless shell to keep installer size down - so we always resolve and pass
 * the full chrome.exe via executablePath.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type LaunchOptions } from "playwright";

/** Prefer full Chromium; never chromium_headless_shell. */
export function resolveFullChromiumExecutable(): string {
  // 1) Explicit override
  const override = process.env.SPECTRA_CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override && existsSync(override)) return override;

  // 2) Playwright registry path for full chromium (not used by headless launch by default)
  try {
    const fromPw = chromium.executablePath();
    if (
      fromPw &&
      existsSync(fromPw) &&
      !/headless.?shell/i.test(fromPw) &&
      !/chromium_headless_shell/i.test(fromPw)
    ) {
      return fromPw;
    }
  } catch {
    // continue to scan
  }

  // 3) Scan PLAYWRIGHT_BROWSERS_PATH (desktop: resources/ms-playwright)
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? undefined
      : path.join(process.env.LOCALAPPDATA || "", "ms-playwright"),
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? undefined
      : path.join(process.env.HOME || "", ".cache", "ms-playwright"),
  ].filter((p): p is string => Boolean(p));

  for (const root of roots) {
    if (!existsSync(root)) continue;
    const found = findChromeExe(root);
    if (found) return found;
  }

  // Last resort: whatever Playwright reports (may fail if only shell is expected)
  return chromium.executablePath();
}

function findChromeExe(root: string): string | undefined {
  let entries: string[] = [];
  try {
    entries = readdirSync(root);
  } catch {
    return undefined;
  }

  // Prefer chromium-NNNN (full), never chromium_headless_shell-*
  const chromiumDirs = entries
    .filter((e) => /^chromium-\d+$/i.test(e))
    .sort()
    .reverse();

  for (const dir of chromiumDirs) {
    const candidates = [
      path.join(root, dir, "chrome-win64", "chrome.exe"),
      path.join(root, dir, "chrome-win", "chrome.exe"),
      path.join(root, dir, "chrome-linux", "chrome"),
      path.join(root, dir, "chrome-linux64", "chrome"),
      path.join(root, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      path.join(root, dir, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
      path.join(root, dir, "chrome-mac-x64", "Chromium.app", "Contents", "MacOS", "Chromium"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  }
  return undefined;
}

export async function launchChromium(opts: LaunchOptions = {}): Promise<Browser> {
  // Force full Chromium binary - env flags alone do not stop headless_shell selection.
  const executablePath = opts.executablePath ?? resolveFullChromiumExecutable();

  if (!existsSync(executablePath)) {
    throw new Error(
      `Spectra Desk Chromium not found at ${executablePath}. ` +
        `Expected full chromium under PLAYWRIGHT_BROWSERS_PATH` +
        (process.env.PLAYWRIGHT_BROWSERS_PATH ? `=${process.env.PLAYWRIGHT_BROWSERS_PATH}` : "") +
        `. Reinstall Spectra Desk or run: npx playwright install chromium`,
    );
  }

  if (/headless.?shell|chromium_headless_shell/i.test(executablePath)) {
    throw new Error(
      `Refusing headless_shell binary (${executablePath}). Desktop ships full Chromium only.`,
    );
  }

  return chromium.launch({
    headless: true,
    ...opts,
    executablePath,
  });
}
