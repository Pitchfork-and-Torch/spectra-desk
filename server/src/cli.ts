#!/usr/bin/env node
/**
 * Spectra Desk CLI - power-user investigations from the terminal
 *
 * Usage:
 *   npx tsx src/cli.ts investigate --first=John --last=Doe --username=johndoe --domain=example.com --mode=fast
 *   npx tsx src/cli.ts investigate -m fast --first John --last Doe --domain example.com
 *   npx tsx src/cli.ts investigate --json sample-subject.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SpectraEngine } from "./engine.js";
import { normalizeInvestigationInput, parseCliFlags, resolveQueryMode } from "./lib/cli-args.js";
import { dispatch, helpText, intake } from "./v9/commands.js";

const engine = new SpectraEngine();
const args = process.argv.slice(2);
const cmd = args[0];

async function investigate(flags: Record<string, string>) {
  let raw = normalizeInvestigationInput(flags);
  if (flags.json) {
    const fromFile = JSON.parse(readFileSync(flags.json, "utf8")) as Record<string, string>;
    raw = normalizeInvestigationInput({ ...fromFile, ...flags });
    delete raw.json;
    delete raw.out;
  }

  const mode = resolveQueryMode(raw);
  process.stderr.write(`Mode: ${mode}\n`);

  const start = Date.now();
  const report = await engine.runInvestigation(raw, (p) => {
    process.stderr.write(`\r[${p.percent}%] ${p.message}`.padEnd(80));
  });
  process.stderr.write("\n");

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(JSON.stringify({
    id: report.id,
    status: report.status,
    elapsedSec: Number(elapsed),
    mode,
    score: report.disambiguation.score,
    tier: report.investigatorBrief?.confidenceTier,
    homonymRisk: report.disambiguation.homonymRisk,
    hits: report.searchHits.length,
    searchHealth: report.searchHealth,
    siteProfile: Boolean(report.siteFingerprint),
    scoredAccounts: report.scoredAccounts?.length ?? 0,
    evidence: report.evidence.length,
    html: path.join(process.env.USERPROFILE || process.env.HOME || ".", ".spectra-desk", "cases", report.id, "REPORT.html"),
  }, null, 2));

  if (flags.out) writeFileSync(flags.out, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(helpText());
    process.exit(0);
  }

  if (cmd === "intake" || cmd === "investigate") {
    const code = await intake(args.slice(1), investigate);
    process.exit(code);
  }

  const dispatched = await dispatch(cmd, args.slice(1));
  if (dispatched >= 0) process.exit(dispatched);

  if (cmd === "list") {
    console.log(JSON.stringify(engine.listReports(), null, 2));
    return;
  }

  if (cmd === "show") {
    const id = args[1];
    if (!id) throw new Error("Usage: show <report-id>");
    const report = engine.getReport(id);
    if (!report) throw new Error(`Report not found: ${id}`);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === "validate") {
    const { spawn } = await import("node:child_process");
    const child = spawn("npm.cmd", ["run", "validate"], { stdio: "inherit", shell: true, cwd: import.meta.dirname });
    child.on("exit", (code) => process.exit(code ?? 1));
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});