import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { SpectraEngine } from "./engine.js";
import { parseInvestigateBody } from "./lib/validate-subject.js";
import { log } from "./lib/logger.js";
import { mountStaticUi } from "./static-ui.js";
import { lookupSubjectHistory, subjectHistoryHint } from "./modules/subject-history.js";
import { SPECTRA_VERSION } from "./version.js";
import { getHealthPayload } from "./lib/health.js";

const VERSION = SPECTRA_VERSION;
const app = new Hono();
const engine = new SpectraEngine();
const CASES = path.join(process.env.USERPROFILE || process.env.HOME || ".", ".spectra-desk", "cases");

app.use("/*", cors());

app.get("/api/health", (c) => c.json(getHealthPayload()));

app.get("/api/subject-history", (c) => {
  const firstName = c.req.query("firstName") || "";
  const lastName = c.req.query("lastName") || "";
  return c.json({
    hint: subjectHistoryHint(firstName, lastName),
    entry: lookupSubjectHistory(firstName, lastName),
  });
});

app.post("/api/reports/:id/dossier/notes", async (c) => {
  const body = await c.req.json<{ notes: string }>();
  try {
    const report = engine.saveDossierNotes(c.req.param("id"), body.notes ?? "");
    return c.json({ ok: true, report });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
  }
});

app.post("/api/query-plan", async (c) => {
  const body = await c.req.json<Record<string, string | undefined> & { families?: string[] | string }>();
  const families = Array.isArray(body.families)
    ? body.families
    : String(body.families || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
  const { describeQueryPlan } = await import("./v9/query-plan.js");
  return c.json(describeQueryPlan(body, families));
});

app.post("/api/reports/:id/lock", async (c) => {
  const body = await c.req.json<{ confirm?: string }>();
  if (body.confirm !== "LOCKED") {
    return c.json({ error: "You confirm LOCKED. The machine does not." }, 400);
  }
  try {
    return c.json({ ok: true, report: engine.lockByHuman(c.req.param("id")) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
  }
});

app.get("/api/cases", async (c) => {
  const { listCaseIndex } = await import("./v9/cases.js");
  return c.json(listCaseIndex());
});

app.post("/api/cases/demo", async (c) => {
  const { seedDemo } = await import("./v9/cases.js");
  return c.json(seedDemo());
});

app.post("/api/reports/:id/identity/confirm", async (c) => {
  const body = await c.req.json<{
    targetId: string;
    excludedIds?: string[];
    mergeIds?: string[];
  }>();
  if (!body.targetId) return c.json({ error: "targetId required" }, 400);
  try {
    const report = await engine.confirmIdentity(c.req.param("id"), body);
    return c.json({ ok: true, report });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
  }
});

app.post("/api/reports/:id/portraits/assign", async (c) => {
  const body = await c.req.json<{
    assignments: Array<{ portraitId: string; assignment: "subject" | "homonym" | "reject" }>;
  }>();
  if (!body.assignments?.length) return c.json({ error: "assignments required" }, 400);
  try {
    const report = await engine.applyPortraitAssignments(c.req.param("id"), body.assignments);
    return c.json({ ok: true, report });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
  }
});

app.get("/api/reports", (c) => c.json(engine.listReports()));

app.get("/api/reports/:id", (c) => {
  const report = engine.getReport(c.req.param("id"));
  if (!report) return c.json({ error: "Not found" }, 404);
  return c.json(report);
});

app.get("/api/reports/:id/pdf", async (c) => {
  const id = c.req.param("id");
  const report = engine.getReport(id);
  const caseDir = path.join(CASES, id);
  const pdfName = report?.pdfFilename || (report?.exportFilename || "REPORT.html").replace(/\.html$/i, ".pdf");
  const pdfPath = path.join(caseDir, pdfName);
  if (!existsSync(pdfPath)) {
    if (!report?.html) return c.text("PDF not found", 404);
    const { generateReportPdfFromCase } = await import("./modules/report-pdf.js");
    const generated = await generateReportPdfFromCase(caseDir, id, report.exportFilename);
    if (!generated) return c.text("PDF generation failed", 500);
    return c.body(readFileSync(path.join(caseDir, generated)), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${generated}"`,
    });
  }
  return c.body(readFileSync(pdfPath), 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${pdfName}"`,
  });
});

app.get("/api/reports/:id/html", (c) => {
  const id = c.req.param("id");
  const report = engine.getReport(id);
  const caseDir = path.join(CASES, id);
  if (report?.exportFilename && existsSync(path.join(caseDir, report.exportFilename))) {
    return c.html(readFileSync(path.join(caseDir, report.exportFilename), "utf8"));
  }
  const htmlPath = path.join(caseDir, "REPORT.html");
  if (!existsSync(htmlPath)) return c.text("Report HTML not found", 404);
  return c.html(readFileSync(htmlPath, "utf8"));
});

app.post("/api/reports/:id/exclude", async (c) => {
  const body = await c.req.json<{ url: string; label?: string; reason?: string }>();
  const report = engine.getReport(c.req.param("id"));
  if (!report) return c.json({ error: "Not found" }, 404);
  const { saveNegativeSignal } = await import("./modules/negative-signals.js");
  saveNegativeSignal(report.subject.firstName, report.subject.lastName, body.url, body.label || body.url, body.reason || "User marked wrong identity");
  const refined = await engine.refineInvestigation(c.req.param("id"), [], {});
  return c.json({ ok: true, report: refined });
});

app.get("/api/reports/:id/manifest", (c) => {
  const manifestPath = path.join(CASES, c.req.param("id"), "MANIFEST.json");
  if (!existsSync(manifestPath)) return c.json({ error: "Manifest not found" }, 404);
  return c.json(JSON.parse(readFileSync(manifestPath, "utf8")));
});

app.post("/api/investigate", async (c) => {
  const body = await c.req.json();
  const parsed = parseInvestigateBody(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  log.info("api", "Investigate", { mode: parsed.data.mode });
  const report = await engine.runInvestigation(parsed.data as Record<string, string>);
  return c.json(report);
});

app.post("/api/reports/:id/refine", async (c) => {
  const body = await c.req.json<{
    answers: Array<{ questionId: string; value: string; selectedOptionId?: string }>;
    extraFields?: Record<string, string>;
  }>();
  const report = await engine.refineInvestigation(c.req.param("id"), body.answers, body.extraFields);
  return c.json(report);
});

app.post("/api/investigate/stream", async (c) => {
  const body = await c.req.json();
  const parsed = parseInvestigateBody(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  return streamSSE(c, async (stream) => {
    const send = async (data: object) => {
      await stream.writeSSE({ data: JSON.stringify(data) });
    };
    try {
      const report = await engine.runInvestigation(parsed.data as Record<string, string>, (p) => void send({ type: "progress", ...p }));
      await send({ type: "complete", report });
    } catch (error) {
      log.error("api", "Investigation failed", { error: error instanceof Error ? error.message : String(error) });
      await send({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  });
});

// --- v7 Toolkit API (operator search catalog, redactor, IBAN) ---
app.get("/api/toolkit/stats", async (c) => {
  const { toolkitStats } = await import("./modules/toolkit-catalog.js");
  return c.json(toolkitStats());
});

app.get("/api/toolkit/categories", async (c) => {
  const { listToolkitCategories } = await import("./modules/toolkit-catalog.js");
  return c.json({ categories: listToolkitCategories() });
});

app.get("/api/toolkit/tools", async (c) => {
  const { listToolkitTools } = await import("./modules/toolkit-catalog.js");
  const category = c.req.query("category") || undefined;
  const group = c.req.query("group") || undefined;
  const query = c.req.query("q") || undefined;
  const limit = Number(c.req.query("limit") || "100");
  return c.json({ tools: listToolkitTools({ category, group, query, limit }) });
});

app.post("/api/toolkit/resolve", async (c) => {
  const body = await c.req.json<{
    toolId?: string;
    params?: Record<string, string>;
    indicator?: string;
    subject?: Record<string, string>;
    maxLinks?: number;
  }>();
  const { buildToolkitPackFromIndicator, buildToolkitPackFromSubject, resolveSingleToolkitTool } =
    await import("./modules/toolkit-resolve.js");
  if (body.toolId) {
    return c.json(resolveSingleToolkitTool(body.toolId, body.params || {}));
  }
  if (body.indicator) {
    return c.json(buildToolkitPackFromIndicator(body.indicator, { maxLinks: body.maxLinks }));
  }
  if (body.subject) {
    return c.json(buildToolkitPackFromSubject(body.subject, { maxTotal: body.maxLinks }));
  }
  return c.json({ error: "Provide toolId, indicator, or subject" }, 400);
});

app.post("/api/toolkit/classify", async (c) => {
  const body = await c.req.json<{ text: string }>();
  if (!body.text?.trim()) return c.json({ error: "text required" }, 400);
  const { classifyIndicators } = await import("./modules/indicator-classify.js");
  return c.json({ indicators: classifyIndicators(body.text) });
});

app.post("/api/toolkit/redact", async (c) => {
  const body = await c.req.json<{
    text: string;
    names?: string[];
    emails?: string[];
    phones?: string[];
    usernames?: string[];
    customPatterns?: Array<{ name: string; pattern: string; flags?: string }>;
    preset?: "client" | "counsel" | "press";
  }>();
  if (!body.text) return c.json({ error: "text required" }, 400);
  const { redactPreset, redactText } = await import("./modules/redactor.js");
  if (body.preset) return c.json(redactPreset(body.text, body.preset, body));
  return c.json(redactText(body.text, body));
});

app.post("/api/toolkit/restore", async (c) => {
  const body = await c.req.json<{
    text: string;
    map: Array<{ placeholder: string; kind: string; original: string; index: number }>;
  }>();
  if (!body.text || !body.map) return c.json({ error: "text and map required" }, 400);
  const { restoreText } = await import("./modules/redactor.js");
  return c.json({
    restored: restoreText(body.text, body.map as import("./modules/redactor.js").RedactionEntry[]),
  });
});

app.post("/api/toolkit/iban", async (c) => {
  const body = await c.req.json<{ iban: string }>();
  if (!body.iban?.trim()) return c.json({ error: "iban required" }, 400);
  const { analyzeIban } = await import("./modules/iban-intel.js");
  return c.json(analyzeIban(body.iban));
});

mountStaticUi(app);

const port = Number(process.env.PORT) || 3847;
const host = process.env.SPECTRA_HOST || "127.0.0.1";
log.info("api", `Spectra Desk v${VERSION} -> http://${host}:${port}`);
serve({ fetch: app.fetch, port, hostname: host });
