import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "./modules/report.js";
import { buildReportBasename } from "./modules/report-filename.js";
import { ArchiveStore } from "./modules/archive.js";
import type { OsintReport } from "./types.js";

const id = process.argv[2] || "spectra-0d2e4803";
const home = process.env.HOME || process.env.USERPROFILE || "";
const storePath = path.join(home, ".spectra-desk", `${id}.json`);
const casesRoot = path.join(home, ".spectra-desk", "cases");

const raw = JSON.parse(readFileSync(storePath, "utf8")) as OsintReport;
const { markdown: _md, html: _html, ...reportData } = raw;
reportData.exportBasename = buildReportBasename(reportData.subject, reportData.completedAt || reportData.createdAt);
const { markdown, html, executiveSummary, sourceInventory } = buildReport(reportData);

const archive = new ArchiveStore(casesRoot);
const exportFilename = archive.saveReport(id, markdown, html, raw.subject, raw.completedAt);

const updated: OsintReport = { ...raw, markdown, html, executiveSummary, sourceInventory, exportBasename: reportData.exportBasename, exportFilename };
writeFileSync(storePath, JSON.stringify(updated, null, 2), "utf8");

const publishedPath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../reports/published"), exportFilename);

console.log(`Regenerated ${id}`);
console.log(`  Store: ${storePath}`);
console.log(`  Case:  ${path.join(casesRoot, id, exportFilename)}`);
console.log(`  Published: ${publishedPath}`);