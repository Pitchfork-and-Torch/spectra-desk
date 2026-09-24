/**
 * Import public search URL catalog from a local Exploratores checkout.
 * Output: server/src/data/toolkit-catalog.json
 *
 * Usage:
 *   node scripts/import-exploratores-catalog.mjs [path-to-Exploratores]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spectraRoot = path.resolve(__dirname, "..");
const exploratoresRoot =
  process.argv[2] || path.join(process.env.USERPROFILE || process.env.HOME || "", "Exploratores");
const outDir = path.join(spectraRoot, "server", "src", "data");
const outFile = path.join(outDir, "toolkit-catalog.json");

const CATEGORY_META = {
  searchengines: { label: "Search Engines", group: "search" },
  names: { label: "People & Names", group: "identity" },
  usernames: { label: "Usernames", group: "identity" },
  email: { label: "Email", group: "identity" },
  phoneint: { label: "Phone (International)", group: "identity" },
  phoneus: { label: "Phone (US)", group: "identity" },
  address: { label: "Addresses", group: "identity" },
  domains: { label: "Domains", group: "web" },
  ip: { label: "IP Addresses", group: "web" },
  facebook: { label: "Facebook", group: "social" },
  instagram: { label: "Instagram", group: "social" },
  linkedin: { label: "LinkedIn", group: "social" },
  x: { label: "X / Twitter", group: "social" },
  vk: { label: "VK", group: "social" },
  keybase: { label: "Keybase", group: "social" },
  communities: { label: "Communities", group: "social" },
  maps: { label: "Maps & GeoInt", group: "geo" },
  images: { label: "Images", group: "media" },
  videos: { label: "Videos", group: "media" },
  docs: { label: "Documents", group: "media" },
  publiccompanyrecords: { label: "Company Records", group: "finance" },
  currencies: { label: "Crypto & Currencies", group: "finance" },
  vehicles: { label: "Vehicles", group: "finance" },
  iban: { label: "IBAN", group: "finance" },
};

const libPath = path.join(exploratoresRoot, "assets", "js", "search-library.js");
if (!fs.existsSync(libPath)) {
  console.error("search-library.js not found at", libPath);
  process.exit(1);
}

const src = fs.readFileSync(libPath, "utf8");
const entryRe =
  /"([^"]+)":\s*\{\s*"urlTemplate":\s*"((?:\\.|[^"\\])*)"(?:\s*,\s*"validator":\s*"([^"]+)")?(?:\s*,\s*"no_input":\s*(true|false))?/g;

const tools = [];
let m;
while ((m = entryRe.exec(src)) !== null) {
  const id = m[1];
  let urlTemplate;
  try {
    urlTemplate = JSON.parse(`"${m[2]}"`);
  } catch {
    urlTemplate = m[2]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
  }
  const category = id.split("-")[0];
  const meta = CATEGORY_META[category] || { label: category, group: "other" };
  const placeholders = [...urlTemplate.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((x) => x[1]);
  tools.push({
    id,
    category,
    group: meta.group,
    categoryLabel: meta.label,
    urlTemplate,
    validator: m[3] || null,
    noInput: m[4] === "true",
    placeholders: [...new Set(placeholders)],
  });
}

const byId = new Map();
for (const t of tools) byId.set(t.id, t);
const unique = [...byId.values()];

const counts = unique.reduce((acc, t) => {
  acc[t.category] = (acc[t.category] || 0) + 1;
  return acc;
}, /** @type {Record<string, number>} */ ({}));

const catalog = {
  source: {
    project: "Exploratores OSINT Toolkit",
    upstream: "https://github.com/SOsintOps/Exploratores",
    version: "3.4.1",
    note:
      "Public search URL catalog extracted for Spectra Desk Toolkit (v7). Spectra reimplements the operator surface natively; credit SOsintOps/Ramingo. Exploratores is AGPL-3.0 — this file is a factual catalog of public search endpoints, not a copy of Exploratores application code.",
  },
  generatedAt: new Date().toISOString(),
  toolCount: unique.length,
  categories: Object.entries(counts)
    .map(([id, count]) => ({
      id,
      count,
      label: (CATEGORY_META[id] || { label: id }).label,
      group: (CATEGORY_META[id] || { group: "other" }).group,
    }))
    .sort((a, b) => b.count - a.count),
  tools: unique,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(catalog, null, 2));
console.log(`Wrote ${unique.length} tools → ${outFile}`);
console.log(
  "Categories:",
  catalog.categories.map((c) => `${c.id}:${c.count}`).join(", "),
);
