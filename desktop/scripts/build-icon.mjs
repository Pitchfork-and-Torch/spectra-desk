#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const assetsDir = path.join(__dirname, "..", "assets");
const require = createRequire(import.meta.url);

const svgPath = path.join(root, "client", "public", "favicon.svg");
const sharp = require(path.join(root, "server", "node_modules", "sharp"));
const pngToIco = (await import("png-to-ico")).default;

const svg = await fs.readFile(svgPath);
const iconBuf = await sharp(svg)
  .resize(512, 512, { fit: "contain", background: { r: 6, g: 8, b: 15, alpha: 1 } })
  .png()
  .toBuffer();
await fs.writeFile(path.join(assetsDir, "icon.png"), iconBuf);

const sizes = [256, 128, 64, 48, 32, 16];
const pngParts = await Promise.all(sizes.map((size) => sharp(iconBuf).resize(size, size).png().toBuffer()));
await fs.writeFile(path.join(assetsDir, "icon.ico"), await pngToIco(pngParts));
console.log("icons written to", assetsDir);