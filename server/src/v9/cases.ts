import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256 } from "../hash.js";
import type { OsintReport } from "../types.js";
import { attachCorroborate } from "./corroborate.js";
import { writeMinimalPdf } from "./pdf-fixture.js";

export function deskHome(): string {
  return process.env.SPECTRA_DESK_HOME || path.join(process.env.USERPROFILE || process.env.HOME || ".", ".spectra-desk");
}

export function casesDir(): string {
  return path.join(deskHome(), "cases");
}

const DEMO_ID = "spectra-demo-quill";

export function buildDemoReport(): OsintReport {
  const createdAt = "2026-09-24T00:00:00.000Z";
  const excerpt = "DEMO. Avery Quill is a fictional composite. This case shows a brief without burning queries.";
  const evidence = {
    id: "ev-demo-1",
    type: "search" as const,
    title: "DEMO label: Avery Quill is not a real person",
    url: "https://example.invalid/demo/avery-quill",
    excerpt,
    hash: sha256(excerpt),
    capturedAt: createdAt,
  };
  const report: OsintReport = {
    id: DEMO_ID,
    demo: true,
    briefTemplate: "client" as const,
    subject: {
      firstName: "Avery",
      lastName: "Quill",
      email: "avery.quill@example.invalid",
      username: "averyquill-demo",
      employer: "Example Archive",
      city: "Nowhere",
      notes: "DEMO fictional composite. Not a private living person.",
    },
    createdAt,
    completedAt: createdAt,
    status: "complete" as const,
    spectraVersion: "9.0.0",
    disambiguation: {
      score: 40,
      label: "DEMO",
      rationale: ["Fictional composite. No live web queries."],
      distinguishingSignals: ["DEMO"],
      homonymRisk: "low" as const,
      candidates: [],
      questions: [],
      refined: true,
    },
    executiveSummary: "DEMO. Avery Quill is a fictional archivist used so a new operator can see a client brief. Investigative lead, not legal proof of identity.",
    searchHits: [],
    excludedHits: [
      {
        title: "Same name, different life: a voice actor also called Quill",
        url: "https://example.invalid/demo/homonym",
        snippet: "Dropped. Different life.",
        source: "demo",
        query: "demo",
        classification: "excluded" as const,
        exclusionReason: "Same name, different life",
      },
    ],
    socialCandidates: [],
    evidence: [evidence],
    sourceInventory: [{ category: "demo", count: 1, sources: ["example.invalid"] }],
    markdown: "",
    html: "",
    identityLock: {
      status: "probable" as const,
      score: 40,
      structuralScore: 20,
      contentScore: 10,
      visualScore: 0,
      signalClasses: ["demo"],
      contradictions: [],
      nextActions: ["Read the brief. Do not treat DEMO as a person."],
      rationale: ["DEMO is not LOCKED. You confirm LOCKED. The machine does not."],
    },
  };
  report.markdown = demoMarkdown();
  report.clientMarkdown = report.markdown;
  report.html = demoHtml();
  return attachCorroborate(report);
}

function demoMarkdown(): string {
  return [
    "# Spectra Desk Intelligence Brief: Avery Quill",
    "",
    "DEMO. Fictional composite. Not a private living person.",
    "",
    "## 1. Executive Summary",
    "",
    "Avery Quill is a made-up archivist. The brief exists so the desk can print without a live query.",
    "",
    "Public sources only. Investigative lead, not legal proof of identity.",
    "",
  ].join("\n");
}

function demoHtml(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>DEMO Avery Quill</title>
<style>
@page { size: letter; margin: 0.6in; }
body { font-family: Georgia, serif; color: #1c1917; background: #fff; }
h1 { font-size: 22pt; }
.banner { color: #0e7490; letter-spacing: 0.08em; font-size: 10pt; }
.foot { margin-top: 24pt; font-size: 9pt; color: #57534e; }
</style></head><body>
<p class="banner">DEMO · Spectra Desk · investigative lead, not legal proof</p>
<h1>Avery Quill</h1>
<p>Fictional composite. This case does not target a private living person.</p>
<p>The public web, as a brief. You confirm LOCKED. The machine does not.</p>
<p class="foot">Spectra Desk · investigative lead, not legal proof of identity.</p>
</body></html>`;
}

export function seedDemo(root = deskHome()): { id: string; caseDir: string; pdfPath: string } {
  const report = buildDemoReport();
  const dir = path.join(root, "cases", report.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "REPORT.html"), report.html, "utf8");
  writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  const pdfPath = path.join(dir, "REPORT.pdf");
  writeMinimalPdf(pdfPath, [
    "Spectra Desk DEMO",
    "Avery Quill is a fictional composite.",
    "Not a private living person.",
    "Investigative lead, not legal proof of identity.",
    "You confirm LOCKED. The machine does not.",
  ]);
  const indexPath = path.join(root, "index.json");
  mkdirSync(root, { recursive: true });
  const index = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as Array<{ id: string }>) : [];
  const next = [{ id: report.id, status: "complete", createdAt: report.createdAt, name: "Avery Quill (DEMO)" }, ...index.filter((row) => row.id !== report.id)];
  writeFileSync(indexPath, JSON.stringify(next, null, 2), "utf8");
  writeFileSync(path.join(root, `${report.id}.json`), JSON.stringify(report, null, 2), "utf8");
  return { id: report.id, caseDir: dir, pdfPath };
}

export function listCaseIndex(root = deskHome()): Array<{ id: string; status?: string; name?: string; createdAt?: string }> {
  const indexPath = path.join(root, "index.json");
  if (!existsSync(indexPath)) return [];
  return JSON.parse(readFileSync(indexPath, "utf8"));
}

export function renameCase(id: string, name: string, root = deskHome()): void {
  const index = listCaseIndex(root).map((row) => (row.id === id ? { ...row, name } : row));
  writeFileSync(path.join(root, "index.json"), JSON.stringify(index, null, 2), "utf8");
}

export function archiveCase(id: string, root = deskHome()): string {
  const src = path.join(root, "cases", id);
  const dest = path.join(root, "archive", id);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (existsSync(src)) renameSync(src, dest);
  return dest;
}

export function exportCase(id: string, dest: string, root = deskHome()): string {
  mkdirSync(dest, { recursive: true });
  const src = path.join(root, "cases", id);
  if (existsSync(src)) cpSync(src, path.join(dest, id), { recursive: true });
  const json = path.join(root, `${id}.json`);
  if (existsSync(json)) cpSync(json, path.join(dest, `${id}.json`));
  return dest;
}

export function destroyCase(id: string, root = deskHome()): { receiptPath: string; sha256: string } {
  const jsonPath = path.join(root, `${id}.json`);
  const body = existsSync(jsonPath) ? readFileSync(jsonPath) : Buffer.from(id);
  const digest = createHash("sha256").update(body).digest("hex");
  const receiptDir = path.join(root, "destroy-receipts");
  mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `${id}.json`);
  writeFileSync(receiptPath, JSON.stringify({ id, sha256: digest, destroyedAt: new Date().toISOString() }, null, 2), "utf8");
  if (existsSync(jsonPath)) rmSync(jsonPath);
  const caseDir = path.join(root, "cases", id);
  if (existsSync(caseDir)) rmSync(caseDir, { recursive: true, force: true });
  const index = listCaseIndex(root).filter((row) => row.id !== id);
  writeFileSync(path.join(root, "index.json"), JSON.stringify(index, null, 2), "utf8");
  return { receiptPath, sha256: digest };
}
