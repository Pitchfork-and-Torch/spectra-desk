#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const rootPkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const version = rootPkg.version || JSON.parse(await fs.readFile(path.join(root, "desktop", "package.json"), "utf8")).version;
const releaseSrc = path.join(root, "desktop", "release");
const outDir = path.join(root, "dist", "release");

const installer = `Spectra-Desk-Setup-${version}.exe`;
const portableZip = `Spectra-Desk-Portable-${version}-win64.zip`;
const portableSrc = path.join(releaseSrc, "win-unpacked");

async function sha256(file) {
  const buf = await fs.readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  if (!existsSync(path.join(releaseSrc, installer))) {
    console.error(`Missing ${installer}. Run: npm run dist:win`);
    process.exit(1);
  }
  if (!existsSync(portableSrc)) {
    console.error("Missing win-unpacked. Run: npm run dist:win");
    process.exit(1);
  }

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await fs.copyFile(path.join(releaseSrc, installer), path.join(outDir, installer));

  const zipPath = path.join(outDir, portableZip);
  console.log("[release] zipping portable build…");
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${portableSrc}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" },
  );

  const startHere = `Spectra Desk v${version} - Windows
================================

INSTALL: Run ${installer}
PORTABLE: Extract ${portableZip} -> run SpectraDesk.exe

FREE
----
No license key. No subscription. MIT source.
Hashed. Unsigned.

WHAT'S NEW IN v9.0.0 CORROBORATE
--------------------------------
- You confirm LOCKED. The machine does not.
- Corroboration matrix, claim ledger, SHA-256 on every capture.
- Fast is capped at 12. Full is capped at 28.
- Toolkit catalog: 898 public search tools.
- Investigative lead, not legal proof of identity.

Requirements: Windows 10/11 64-bit, internet, about 1.5 GB disk
Data folder: %USERPROFILE%\\.spectra-desk\\cases\\
`;
  await fs.writeFile(path.join(outDir, "START-HERE.txt"), startHere, "utf8");

  const files = [installer, portableZip, "START-HERE.txt"];
  const sums = [];
  for (const f of files) {
    sums.push(`${await sha256(path.join(outDir, f))}  ${f}`);
  }
  await fs.writeFile(path.join(outDir, "SHA256SUMS.txt"), sums.join("\n") + "\n", "utf8");

  console.log("[release] packaged →", outDir);
  for (const f of [...files, "SHA256SUMS.txt"]) {
    const stat = await fs.stat(path.join(outDir, f));
    console.log(`  ${f} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});