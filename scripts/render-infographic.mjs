import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(path.join(root, "server", "package.json"));
const { chromium } = require("playwright");

const html = path.join(root, "docs", "assets", "infographic-v9.html");
const out = path.join(root, "docs", "assets", "spectra-v9-infographic.png");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.screenshot({ path: out, type: "png", fullPage: false });
await browser.close();
console.log("wrote", out);
