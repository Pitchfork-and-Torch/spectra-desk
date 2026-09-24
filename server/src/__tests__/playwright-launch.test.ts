import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveFullChromiumExecutable } from "../lib/playwright-launch.js";

describe("playwright-launch", () => {
  it("resolves full Chromium, never headless_shell", () => {
    const exe = resolveFullChromiumExecutable();
    expect(exe).toBeTruthy();
    expect(/headless.?shell|chromium_headless_shell/i.test(exe)).toBe(false);
    // Prefer chrome.exe / chrome binary name
    const base = path.basename(exe).toLowerCase();
    expect(base === "chrome.exe" || base === "chrome" || base === "chromium").toBe(true);
  });

  it("finds chrome under desktop ms-playwright path when set", () => {
    const desktopPw = path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "SpectraDesk",
      "resources",
      "ms-playwright",
    );
    if (!existsSync(desktopPw)) return; // skip if not installed

    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    process.env.PLAYWRIGHT_BROWSERS_PATH = desktopPw;
    try {
      const exe = resolveFullChromiumExecutable();
      expect(exe.toLowerCase()).toContain("chromium-");
      expect(exe.toLowerCase()).not.toContain("headless");
      expect(existsSync(exe)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prev;
    }
  });
});
