/**
 * v9 CLI beats. Agents can draft. Agents cannot LOCK.
 * `spectra lock --human` is the operator at a keyboard.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { SpectraEngine } from "../engine.js";
import { normalizeInvestigationInput, parseCliFlags, resolveQueryMode } from "../lib/cli-args.js";
import { listToolkitTools, toolkitStats } from "../modules/toolkit-catalog.js";
import { archiveCase, destroyCase, exportCase, listCaseIndex, renameCase, seedDemo } from "./cases.js";
import { runDoctor } from "./doctor.js";
import { helpText } from "./help.js";
import { describeQueryPlan } from "./query-plan.js";

export { helpText };

function flagRecord(args: string[]): Record<string, string> {
  return parseCliFlags(args);
}

export async function dispatch(cmd: string, args: string[]): Promise<number> {
  if (!cmd || cmd === "help" || cmd === "--help" || args.includes("--help")) {
    console.log(helpText());
    return 0;
  }
  if (cmd === "doctor") {
    const result = await runDoctor();
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (cmd === "toolkit") {
    const flags = flagRecord(args);
    const query = flags.query || flags.q || args.filter((part) => !part.startsWith("-")).join(" ");
    const tools = listToolkitTools({ query, limit: Number(flags.limit || 20) });
    console.log(JSON.stringify({ toolCount: toolkitStats().toolCount, matches: tools.length, tools }, null, 2));
    return 0;
  }
  if (cmd === "case") {
    return caseCommand(args);
  }
  if (cmd === "divide" || cmd === "brief" || cmd === "export") {
    return reportCommand(cmd, args);
  }
  if (cmd === "lock") {
    return lockCommand(args);
  }
  return -1;
}

function caseCommand(args: string[]): number {
  const sub = args[0] || "list";
  if (sub === "demo") {
    console.log(JSON.stringify(seedDemo(), null, 2));
    return 0;
  }
  if (sub === "list") {
    console.log(JSON.stringify(listCaseIndex(), null, 2));
    return 0;
  }
  const id = args[1];
  if (!id) {
    console.error("Usage: case list|demo|rename <id> <name>|archive <id>|export <id> <dir>|destroy <id>");
    return 1;
  }
  if (sub === "rename") {
    renameCase(id, args.slice(2).join(" ") || id);
    console.log(JSON.stringify({ id, renamed: true }));
    return 0;
  }
  if (sub === "archive") {
    console.log(JSON.stringify({ id, path: archiveCase(id) }));
    return 0;
  }
  if (sub === "export") {
    const dest = args[2] || path.join(process.cwd(), "spectra-export");
    console.log(JSON.stringify({ id, dest: exportCase(id, dest) }));
    return 0;
  }
  if (sub === "destroy") {
    console.log(JSON.stringify(destroyCase(id)));
    return 0;
  }
  console.error(`Unknown case command: ${sub}`);
  return 1;
}

function reportCommand(cmd: string, args: string[]): number {
  const id = args.find((part) => !part.startsWith("-"));
  if (!id) {
    console.error(`Usage: ${cmd} <report-id>`);
    return 1;
  }
  const engine = new SpectraEngine();
  const report = engine.getReport(id);
  if (!report) {
    console.error(`Report not found: ${id}`);
    return 1;
  }
  if (cmd === "divide") {
    console.log(JSON.stringify(report.corroboration || { note: "No matrix on this case. Run intake on v9." }, null, 2));
    return 0;
  }
  if (cmd === "brief") {
    console.log(JSON.stringify({
      id: report.id,
      template: report.briefTemplate || "client",
      claims: report.claimLedger?.rows.length || 0,
      markdown: report.clientMarkdown || report.markdown,
      locked: report.identityLock?.status === "locked" && report.identityLock.lockedBy === "operator",
    }, null, 2));
    return 0;
  }
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "";
  if (out) writeFileSync(out, report.clientMarkdown || report.markdown, "utf8");
  console.log(JSON.stringify({
    id: report.id,
    ledger: report.claimLedger?.rows.length || 0,
    merkle: report.merkleSeal || null,
    wrote: out || null,
  }, null, 2));
  return 0;
}

function lockCommand(args: string[]): number {
  const human = args.includes("--human");
  const id = args.find((part) => !part.startsWith("-"));
  if (!human) {
    console.error("Agents cannot LOCK. You confirm LOCKED. The machine does not. An operator at the keyboard may pass --human.");
    return 2;
  }
  if (!id) {
    console.error("Usage: lock <report-id> --human");
    return 1;
  }
  const engine = new SpectraEngine();
  const report = engine.lockByHuman(id);
  console.log(JSON.stringify({
    id: report.id,
    status: report.identityLock?.status,
    lockedBy: report.identityLock?.lockedBy,
    merkle: report.merkleSeal?.root || null,
  }, null, 2));
  return 0;
}

export async function intake(args: string[], investigate: (flags: Record<string, string>) => Promise<void>): Promise<number> {
  const flags = flagRecord(args);
  if (flags.demo === "true") {
    console.log(JSON.stringify(seedDemo(), null, 2));
    return 0;
  }
  if (flags.plan === "true" || flags["plan-only"] === "true") {
    const raw = normalizeInvestigationInput(flags);
    raw.mode = resolveQueryMode(raw);
    console.log(JSON.stringify(describeQueryPlan(raw, (flags.families || "").split(",").filter(Boolean)), null, 2));
    return 0;
  }
  await investigate(flags);
  return 0;
}
