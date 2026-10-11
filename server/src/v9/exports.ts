import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { OsintReport } from "../types.js";
import { ledgerMarkdown } from "./corroborate.js";

export type BriefTemplate = "client" | "vendor" | "employment-public" | "journalist-subject" | "username-only";

const SECTION_BY_HEADING: Record<string, string> = {
  "1. Executive Summary": "summary",
  "2. Identity Confirmation": "identity",
  "3. Professional": "business",
  "4.": "timeline",
  "5. Digital": "accounts",
  "Claim ledger": "ledger",
};

const KEEP: Record<BriefTemplate, string[]> = {
  client: ["summary", "identity", "business", "timeline", "accounts", "ledger"],
  vendor: ["summary", "business", "accounts", "ledger"],
  "employment-public": ["summary", "business", "timeline", "ledger"],
  "journalist-subject": ["summary", "identity", "timeline", "accounts", "ledger"],
  "username-only": ["summary", "accounts", "ledger"],
};

export function applyTemplate(markdown: string, template: BriefTemplate): string {
  const keep = new Set(KEEP[template]);
  const blocks = markdown.split(/\n(?=## )/);
  const kept = blocks.filter((block, index) => {
    if (index === 0) return true;
    const heading = block.split("\n")[0] || "";
    const key = Object.entries(SECTION_BY_HEADING).find(([prefix]) => heading.includes(prefix))?.[1];
    if (!key) return template === "client";
    return keep.has(key);
  });
  return [`Template: ${template}`, "", ...kept].join("\n");
}

export function stixLite(report: OsintReport): { type: "bundle"; spec: "stix-lite"; objects: unknown[] } | null {
  const accounts = report.attributionGate?.mainAccounts || [];
  if (accounts.length === 0) return null;
  return {
    type: "bundle",
    spec: "stix-lite",
    objects: accounts.slice(0, 12).map((account, index) => ({
      type: "identity",
      id: `identity--spectra-${index + 1}`,
      name: account.username,
      description: `${account.platform} high-confidence account. Not a rejected homonym.`,
      external_references: account.url ? [{ source_name: account.platform, url: account.url }] : [],
    })),
  };
}

export function writeCaseExports(caseDir: string, report: OsintReport): string[] {
  mkdirSync(caseDir, { recursive: true });
  const written: string[] = [];
  const ledger = ledgerMarkdown(report);
  const template = (report.briefTemplate || "client") as BriefTemplate;
  const brief = applyTemplate(`${report.clientMarkdown || report.markdown || ""}\n\n${ledger}`, template);
  const files: Array<[string, string]> = [
    ["LEDGER.md", ledger],
    ["LEDGER.json", JSON.stringify(report.claimLedger || { rows: [] }, null, 2)],
    ["MATRIX.json", JSON.stringify(report.corroboration || {}, null, 2)],
    ["MERKLE.json", JSON.stringify(report.merkleSeal || { pendingHumanLock: true }, null, 2)],
    ["BRIEF.md", brief],
  ];
  const stix = stixLite(report);
  if (stix) files.push(["STIX-LITE.json", JSON.stringify(stix, null, 2)]);
  for (const [name, body] of files) {
    writeFileSync(path.join(caseDir, name), body, "utf8");
    written.push(name);
  }
  const vault = path.join(caseDir, "obsidian");
  mkdirSync(vault, { recursive: true });
  writeFileSync(path.join(vault, "brief.md"), brief, "utf8");
  writeFileSync(path.join(vault, "ledger.md"), ledger, "utf8");
  written.push("obsidian/brief.md", "obsidian/ledger.md");
  return written;
}
