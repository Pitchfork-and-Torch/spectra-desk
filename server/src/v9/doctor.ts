import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../hash.js";
import { pickFreePort } from "../lib/free-port.js";
import { redactPreset } from "../modules/redactor.js";
import { QUERY_CAPS } from "../modules/query-multiply.js";
import { toolkitStats } from "../modules/toolkit-catalog.js";
import { describeQueryPlan } from "./query-plan.js";
import { seedDemo } from "./cases.js";
import { helpText } from "./help.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const MCP_BEATS = ["intake", "divide", "brief", "lock", "export_case", "doctor", "toolkit_search", "case_desk"];
const CLI_COMMANDS = ["intake", "divide", "brief", "lock", "export", "doctor", "toolkit", "case"];

export async function runDoctor(): Promise<{ ok: boolean; checks: DoctorCheck[] }> {
  const checks: DoctorCheck[] = [];
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

  const stats = toolkitStats();
  const readme = existsSync(path.join(root, "README.md")) ? readFileSync(path.join(root, "README.md"), "utf8") : "";
  checks.push({
    name: "catalog",
    ok: stats.toolCount === 898 && readme.includes(String(stats.toolCount)),
    detail: `toolkit ${stats.toolCount}; readme mentions count: ${readme.includes(String(stats.toolCount))}`,
  });

  const home = mkdtempSync(path.join(tmpdir(), "spectra-doctor-"));
  const demo = seedDemo(home);
  checks.push({
    name: "case-dir",
    ok: existsSync(demo.caseDir),
    detail: demo.caseDir,
  });

  const hashed = sha256("spectra-desk-fixture");
  checks.push({
    name: "hash",
    ok: hashed.length === 64 && hashed === sha256("spectra-desk-fixture") && hashed !== sha256("other"),
    detail: hashed.slice(0, 12),
  });

  try {
    const port = await pickFreePort(3847);
    checks.push({ name: "port", ok: port >= 3847 && port < 3847 + 32, detail: String(port) });
  } catch (err) {
    checks.push({ name: "port", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  const plan = describeQueryPlan({
    mode: "fast",
    firstName: "Avery",
    lastName: "Quill",
    email: "avery.quill@example.invalid",
    username: "averyquill-demo",
    employer: "Example Archive",
  });
  checks.push({
    name: "fast-cap",
    ok: plan.count <= QUERY_CAPS.fast && plan.cap === 12,
    detail: `${plan.count}/${plan.cap}`,
  });

  const pdf = existsSync(demo.pdfPath) ? readFileSync(demo.pdfPath) : Buffer.alloc(0);
  checks.push({
    name: "pdf",
    ok: pdf.subarray(0, 5).toString() === "%PDF-",
    detail: demo.pdfPath,
  });

  const mcpSrc = readFileSync(path.join(root, "server", "src", "mcp.ts"), "utf8");
  const missingMcp = MCP_BEATS.filter((name) => !mcpSrc.includes(`"${name}"`));
  checks.push({ name: "mcp", ok: missingMcp.length === 0, detail: missingMcp.join(",") || "beats present" });

  const help = helpText();
  const missingCli = CLI_COMMANDS.filter((name) => !help.includes(name));
  checks.push({ name: "cli-help", ok: missingCli.length === 0, detail: missingCli.join(",") || "help lists beats" });

  const fixture = "Reach me at ada@example.com or 415-555-0130. SSN 123-45-6789.";
  const counsel = redactPreset(fixture, "counsel");
  const leaked = counsel.redacted.includes("ada@example.com") || counsel.redacted.includes("123-45-6789") || counsel.redacted.includes("415-555-0130");
  checks.push({ name: "redactor", ok: !leaked, detail: leaked ? "fixture PII leaked" : "counsel-safe" });

  return { ok: checks.every((check) => check.ok), checks };
}
