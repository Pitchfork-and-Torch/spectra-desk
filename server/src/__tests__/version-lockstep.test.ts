import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPECTRA_VERSION } from "../version.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function pkgVersion(rel: string): string {
  const raw = JSON.parse(readFileSync(path.join(root, rel), "utf8")) as { version: string };
  return raw.version;
}

describe("version lockstep", () => {
  it("root/server/client/desktop package.json match SPECTRA_VERSION", () => {
    expect(pkgVersion("package.json")).toBe(SPECTRA_VERSION);
    expect(pkgVersion("server/package.json")).toBe(SPECTRA_VERSION);
    expect(pkgVersion("client/package.json")).toBe(SPECTRA_VERSION);
    expect(pkgVersion("desktop/package.json")).toBe(SPECTRA_VERSION);
  });

  it("client version.ts matches engine", () => {
    const src = readFileSync(path.join(root, "client/src/version.ts"), "utf8");
    expect(src).toContain(`"${SPECTRA_VERSION}"`);
  });
});
