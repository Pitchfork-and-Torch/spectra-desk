#!/usr/bin/env node
/**
 * Spectra MCP - investigator-grade OSINT for identity resolution (v8 Client Dossier + Toolkit)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SpectraEngine, SPECTRA_ENGINE_VERSION } from "./engine.js";
import { lookupSubjectHistory, subjectHistoryHint } from "./modules/subject-history.js";
import { generateMonikers, buildMonikerDiscoveryDorks } from "./modules/moniker-engine.js";
import { enrichDeepProfile } from "./modules/deep-profile.js";
import { buildReverseImageQueries, buildReverseImagePack } from "./modules/reverse-image.js";
import { filterGalleryPortraits } from "./modules/portrait-quality.js";
import { buildPublicRecordDorks } from "./modules/public-records-dorks.js";
import { listToolkitCategories, listToolkitTools, toolkitStats } from "./modules/toolkit-catalog.js";
import {
  buildToolkitPackFromIndicator,
  buildToolkitPackFromSubject,
  resolveSingleToolkitTool,
} from "./modules/toolkit-resolve.js";
import { classifyIndicator, classifyIndicators } from "./modules/indicator-classify.js";
import { redactText, restoreText, redactionMapToCsv } from "./modules/redactor.js";
import { analyzeIban } from "./modules/iban-intel.js";
import { describeQueryPlan } from "./v9/query-plan.js";
import { runDoctor } from "./v9/doctor.js";
import { listCaseIndex, seedDemo } from "./v9/cases.js";

const engine = new SpectraEngine();
const server = new McpServer({ name: "spectra-mcp", version: SPECTRA_ENGINE_VERSION });

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function summarizeReport(report: Awaited<ReturnType<SpectraEngine["runInvestigation"]>>) {
  return {
    id: report.id,
    status: report.status,
    version: SPECTRA_ENGINE_VERSION,
    disambiguation: report.disambiguation,
    investigatorBrief: report.investigatorBrief,
    executiveSummary: report.executiveSummary,
    corroboratedHits: report.searchHits.filter((h) => h.classification === "corroborated").length,
    excludedHits: report.excludedHits?.length || 0,
    usernameProbes: report.usernameProbes?.filter((p) => p.exists).length || 0,
    githubIntel: report.githubIntel,
    domainIntel: report.domainIntel,
    accountCorrelation: report.accountCorrelation,
    chainOfCustody: {
      manifestHash: report.chainOfCustody?.manifestHash,
      evidenceCount: report.chainOfCustody?.evidenceCount,
    },
    identityWorkbench: report.identityWorkbench
      ? {
          profiles: report.identityWorkbench.profiles?.length ?? 0,
          selectedTargetId: report.identityWorkbench.selectedTargetId,
          confirmed: report.identityWorkbench.confirmed,
          summary: report.identityWorkbench.summary,
        }
      : undefined,
    dossier: report.dossier
      ? {
          confidenceTier: report.dossier.confidenceTier,
          targetLabel: report.dossier.targetLabel,
          narrativeSummary: report.dossier.narrativeSummary,
          hasNotes: Boolean(report.dossier.investigatorNotes),
        }
      : undefined,
    portraitIntel: report.portraitIntel
      ? {
          candidateCount: report.portraitIntel.candidates?.length ?? 0,
          hasAnchor: Boolean(report.portraitIntel.anchorPortrait),
          summary: report.portraitIntel.summary,
        }
      : undefined,
    mediaTimelineEvents: report.mediaTimeline?.entries?.length ?? 0,
    monikerCount: report.monikerInventory?.length ?? 0,
    deepProfilesWithContent: report.deepProfiles?.filter((d) => d.hasContent).length ?? 0,
    identityLock: report.identityLock,
    reverseImageQueryCount: report.reverseImageQueries?.length ?? 0,
    htmlPath: `~/.spectra-desk/cases/${report.id}/REPORT.html`,
    manifestPath: `~/.spectra-desk/cases/${report.id}/MANIFEST.json`,
    pdfFilename: report.pdfFilename,
    topHits: report.searchHits.slice(0, 5),
  };
}

const subjectSchema = {
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  username: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  employer: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  mode: z
    .enum(["full", "fast", "validation"])
    .optional()
    .describe("Query mode: full (24), fast (12), validation (8)"),
};

server.tool(
  "investigate_subject",
  "Run full Spectra v5 investigation: parallel cached search, username correlation (Sherlock-scale probes), domain intel, GitHub, homonym filtering, identity workbench, subject dossier, portrait disambiguation, media timeline, investigator brief, and chain of custody.",
  subjectSchema,
  async (args) => {
    const report = await engine.runInvestigation(args);
    return json(summarizeReport(report));
  },
);

server.tool(
  "correlate_username",
  "Cross-platform username probe - GitHub API, Reddit, HN, Keybase, Dev.to, Sherlock-scale HTTP grid, and platform resolvers.",
  {
    username: z.string().describe("Username/handle to correlate across platforms"),
  },
  async ({ username }) => {
    const probes = await engine.probeUsernameOnly(username);
    return json({
      username,
      found: probes.filter((p) => p.exists),
      notFound: probes.filter((p) => !p.exists).map((p) => p.platform),
      totalChecked: probes.length,
    });
  },
);

server.tool(
  "get_report",
  "Retrieve a completed Spectra report by ID (full JSON including workbench, dossier, portraits).",
  {
    id: z.string(),
  },
  async ({ id }) => {
    const report = engine.getReport(id);
    if (!report) return { content: [{ type: "text", text: "Report not found" }], isError: true };
    return json(report);
  },
);

server.tool("list_reports", "List recent Spectra investigations.", {}, async () =>
  json(engine.listReports()),
);

server.tool(
  "refine_disambiguation",
  "Apply user answers to boost disambiguation and re-run analysis.",
  {
    reportId: z.string(),
    answers: z.array(
      z.object({
        questionId: z.string(),
        value: z.string(),
        selectedOptionId: z.string().optional(),
      }),
    ),
    extraFields: z.record(z.string(), z.string()).optional(),
  },
  async (args) => {
    const report = await engine.refineInvestigation(args.reportId, args.answers, args.extraFields);
    return json({
      id: report.id,
      disambiguation: report.disambiguation,
      investigatorBrief: report.investigatorBrief,
      identityWorkbench: report.identityWorkbench,
      dossier: report.dossier
        ? {
            confidenceTier: report.dossier.confidenceTier,
            targetLabel: report.dossier.targetLabel,
            narrativeSummary: report.dossier.narrativeSummary,
          }
        : undefined,
    });
  },
);

server.tool(
  "confirm_identity",
  "Confirm the TARGET identity profile in the Identity Workbench and optionally exclude/merge candidates.",
  {
    reportId: z.string().describe("Spectra report ID"),
    targetId: z.string().describe("Profile ID to mark as the confirmed TARGET"),
    excludedIds: z.array(z.string()).optional().describe("Profile IDs to mark as wrong identity"),
    mergeIds: z.array(z.string()).optional().describe("Profile IDs to merge into the TARGET"),
  },
  async (args) => {
    try {
      const report = await engine.confirmIdentity(args.reportId, {
        targetId: args.targetId,
        excludedIds: args.excludedIds,
        mergeIds: args.mergeIds,
      });
      return json({
        ok: true,
        locked: false,
        note: "Workbench confirm is not LOCKED. Agents cannot LOCK.",
        id: report.id,
        selectedTargetId: report.identityWorkbench?.selectedTargetId,
        confirmed: report.identityWorkbench?.confirmed,
        workbenchSummary: report.identityWorkbench?.summary,
        dossier: report.dossier
          ? {
              confidenceTier: report.dossier.confidenceTier,
              targetLabel: report.dossier.targetLabel,
              narrativeSummary: report.dossier.narrativeSummary,
            }
          : undefined,
      });
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    }
  },
);

server.tool(
  "assign_portraits",
  "Assign portrait candidates as subject / homonym / reject (visual disambiguation).",
  {
    reportId: z.string(),
    assignments: z.array(
      z.object({
        portraitId: z.string(),
        assignment: z.enum(["subject", "homonym", "reject"]),
      }),
    ),
  },
  async (args) => {
    try {
      const report = await engine.applyPortraitAssignments(args.reportId, args.assignments);
      return json({
        ok: true,
        id: report.id,
        portraitIntel: report.portraitIntel
          ? {
              candidateCount: report.portraitIntel.candidates?.length ?? 0,
              disambiguation: report.portraitIntel.disambiguation,
            }
          : undefined,
        scoredAccounts: report.scoredAccounts?.slice(0, 10),
      });
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    }
  },
);

server.tool(
  "get_dossier",
  "Return the subject dossier summary for a report (narrative identity brief + investigator notes).",
  {
    reportId: z.string(),
  },
  async ({ reportId }) => {
    const report = engine.getReport(reportId);
    if (!report) return { content: [{ type: "text", text: "Report not found" }], isError: true };
    return json({
      id: report.id,
      dossier: report.dossier,
      mediaTimeline: report.mediaTimeline,
      exportFilename: report.exportFilename,
      pdfFilename: report.pdfFilename,
    });
  },
);

server.tool(
  "save_dossier_notes",
  "Persist investigator notes on a report dossier.",
  {
    reportId: z.string(),
    notes: z.string().describe("Free-form investigator notes to attach to the dossier"),
  },
  async ({ reportId, notes }) => {
    try {
      const report = engine.saveDossierNotes(reportId, notes);
      return json({
        ok: true,
        id: report.id,
        hasNotes: Boolean(report.dossier?.investigatorNotes),
      });
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    }
  },
);

server.tool(
  "subject_history",
  "Look up prior investigation history for a first/last name (local cache only).",
  {
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  },
  async ({ firstName, lastName }) => {
    return json({
      hint: subjectHistoryHint(firstName || "", lastName || ""),
      entry: lookupSubjectHistory(firstName || "", lastName || ""),
    });
  },
);

// --- v6 Dossier Engine tools ---

server.tool(
  "discover_monikers",
  "Generate moniker/alias inventory for a subject (exact, dotted, initial, nickname, leet, aka). Does not probe platforms.",
  {
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    middleName: z.string().optional(),
    username: z.string().optional(),
    email: z.string().optional(),
    notes: z.string().optional(),
    max: z.number().optional(),
  },
  async (args) => {
    const monikers = generateMonikers(args, { max: args.max ?? 40 });
    return json({
      count: monikers.length,
      monikers,
      discoveryDorks: buildMonikerDiscoveryDorks(args, monikers).slice(0, 10),
    });
  },
);

server.tool(
  "enrich_profile",
  "Deep-enrich a single public profile URL/username (bio, avatar, location when publicly available).",
  {
    platform: z.string(),
    username: z.string(),
    url: z.string(),
    exists: z.boolean().optional(),
  },
  async (args) => {
    const profile = await enrichDeepProfile({
      platform: args.platform,
      username: args.username,
      url: args.url,
      exists: args.exists ?? true,
      confidence: 70,
      method: "http-probe",
    });
    return json(profile);
  },
);

server.tool(
  "get_identity_lock",
  "Return multi-signal identity lock status for a completed report (locked/probable/possible/insufficient).",
  { reportId: z.string() },
  async ({ reportId }) => {
    const report = engine.getReport(reportId);
    if (!report) return { content: [{ type: "text", text: "Report not found" }], isError: true };
    return json({
      id: report.id,
      identityLock: report.identityLock,
      disambiguationScore: report.disambiguation?.score,
      dossierTier: report.dossier?.confidenceTier,
      monikerCount: report.monikerInventory?.length,
      deepProfilesWithContent: report.deepProfiles?.filter((d) => d.hasContent).length,
    });
  },
);

server.tool(
  "reverse_image_search",
  "Build public reverse-image search URLs (Yandex/Google Lens/TinEye/Bing) for operator or automated follow-up.",
  {
    imageUrl: z.string().describe("Publicly reachable image URL"),
  },
  async ({ imageUrl }) => {
    return json({ imageUrl, queries: buildReverseImageQueries(imageUrl) });
  },
);

server.tool(
  "filter_portraits",
  "Apply portrait quality gate - reject platform logos and non-face assets (YouTube/Google defaults, etc.).",
  {
    portraits: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        platform: z.string(),
        profileUrl: z.string().optional(),
        imageUrl: z.string(),
      }),
    ),
  },
  async ({ portraits }) => {
    const mapped = portraits.map((p) => ({
      ...p,
      role: "corroborating" as const,
      matchVerdict: "unknown" as const,
    }));
    return json(filterGalleryPortraits(mapped));
  },
);

server.tool(
  "public_record_dorks",
  "Generate public-record / news / property / court dorks for a subject (indexable sources only).",
  {
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    employer: z.string().optional(),
    mode: z.enum(["full", "fast", "validation"]).optional(),
  },
  async (args) => {
    return json({
      dorks: buildPublicRecordDorks(args, args.mode || "full"),
      disclaimer: "Public sources only. Investigative lead - not legal proof of identity.",
    });
  },
);

server.tool(
  "get_moniker_inventory",
  "Return moniker inventory stored on a completed report.",
  { reportId: z.string() },
  async ({ reportId }) => {
    const report = engine.getReport(reportId);
    if (!report) return { content: [{ type: "text", text: "Report not found" }], isError: true };
    return json({ id: report.id, monikers: report.monikerInventory || [] });
  },
);

server.tool(
  "get_deep_profiles",
  "Return deep profile enrichments for a completed report.",
  { reportId: z.string() },
  async ({ reportId }) => {
    const report = engine.getReport(reportId);
    if (!report) return { content: [{ type: "text", text: "Report not found" }], isError: true };
    return json({ id: report.id, deepProfiles: report.deepProfiles || [] });
  },
);

server.tool(
  "get_reverse_image_pack",
  "Return reverse-image query pack for face-quality portraits on a report.",
  { reportId: z.string() },
  async ({ reportId }) => {
    const report = engine.getReport(reportId);
    if (!report) return { content: [{ type: "text", text: "Report not found" }], isError: true };
    if (report.reverseImageQueries?.length) {
      return json({ id: report.id, queries: report.reverseImageQueries });
    }
    const urls = (report.portraitIntel?.candidates || []).map((c) => c.imageUrl);
    return json({ id: report.id, ...buildReverseImagePack(urls) });
  },
);

// --- v7 Toolkit tools ---
server.tool(
  "list_toolkit_tools",
  "List Spectra Toolkit search tools (898+ public operator search endpoints across people, domains, social, finance, geo, media).",
  {
    category: z.string().optional().describe("e.g. domains, usernames, email, names, phoneus"),
    group: z.string().optional().describe("search | identity | web | social | geo | media | finance"),
    query: z.string().optional().describe("Filter by tool id or URL fragment"),
    limit: z.number().optional(),
  },
  async (args) => {
    return json({
      stats: toolkitStats(),
      categories: listToolkitCategories(),
      tools: listToolkitTools({
        category: args.category,
        group: args.group,
        query: args.query,
        limit: args.limit ?? 50,
      }),
    });
  },
);

server.tool(
  "toolkit_pack",
  "Build an operator URL pack for a freeform indicator (email/phone/domain/username/name/IP/IBAN) or subject fields. Opens no tabs - returns ready-to-use public search URLs.",
  {
    indicator: z.string().optional().describe("Freeform indicator to classify and pack"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    username: z.string().optional(),
    website: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    employer: z.string().optional(),
    maxLinks: z.number().optional(),
  },
  async (args) => {
    if (args.indicator?.trim()) {
      return json(buildToolkitPackFromIndicator(args.indicator, { maxLinks: args.maxLinks }));
    }
    return json(
      buildToolkitPackFromSubject(
        {
          firstName: args.firstName,
          lastName: args.lastName,
          email: args.email,
          phone: args.phone,
          username: args.username,
          website: args.website,
          city: args.city,
          state: args.state,
          employer: args.employer,
        },
        { maxTotal: args.maxLinks },
      ),
    );
  },
);

server.tool(
  "resolve_toolkit_url",
  "Resolve a single toolkit tool id with parameters into a final public search URL.",
  {
    toolId: z.string(),
    params: z.record(z.string(), z.string()).optional(),
  },
  async ({ toolId, params }) => {
    return json(resolveSingleToolkitTool(toolId, params || {}));
  },
);

server.tool(
  "classify_indicator",
  "Classify free-text indicators (email, phone, domain, IP, username, IBAN, crypto, VIN, name) for Toolkit routing.",
  {
    text: z.string().describe("One indicator or multi-line / comma-separated list"),
  },
  async ({ text }) => {
    const multi = text.includes("\n") || text.includes(",") || text.includes(";");
    return json(multi ? { indicators: classifyIndicators(text) } : classifyIndicator(text));
  },
);

server.tool(
  "redact_pii",
  "Redact PII from text with numbered placeholders for safe external AI handoff. Returns redacted text + redaction map (keep map local).",
  {
    text: z.string(),
    names: z.array(z.string()).optional(),
    emails: z.array(z.string()).optional(),
    phones: z.array(z.string()).optional(),
    usernames: z.array(z.string()).optional(),
  },
  async (args) => {
    const result = redactText(args.text, args);
    return json({
      ...result,
      mapCsv: redactionMapToCsv(result.map),
    });
  },
);

server.tool(
  "restore_pii",
  "Restore redacted text using a redaction map from redact_pii.",
  {
    text: z.string(),
    map: z.array(
      z.object({
        placeholder: z.string(),
        kind: z.string(),
        original: z.string(),
        index: z.number(),
      }),
    ),
  },
  async ({ text, map }) => {
    return json({
      restored: restoreText(
        text,
        map.map((m) => ({
          placeholder: m.placeholder,
          kind: m.kind as import("./modules/redactor.js").PiiKind,
          original: m.original,
          index: m.index,
        })),
      ),
    });
  },
);

server.tool(
  "analyze_iban",
  "Local offline IBAN validation (ISO 13616 mod-97) with country parse and public search links.",
  { iban: z.string() },
  async ({ iban }) => json(analyzeIban(iban)),
);

server.tool(
  "get_toolkit_pack",
  "Return the Toolkit operator pack stored on a completed investigation report.",
  { reportId: z.string() },
  async ({ reportId }) => {
    const report = engine.getReport(reportId);
    if (!report) return { content: [{ type: "text", text: "Report not found" }], isError: true };
    return json({
      id: report.id,
      toolkitPack: report.toolkitPack || null,
      note: report.toolkitPack
        ? undefined
        : "No toolkit pack on report - run a new investigation on v7+ or call toolkit_pack.",
    });
  },
);

server.tool(
  "intake",
  "Draft a case from a name, email, or username. Pass planOnly to show the query plan without spending it.",
  {
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    username: z.string().optional(),
    employer: z.string().optional(),
    mode: z.string().optional(),
    planOnly: z.boolean().optional(),
  },
  async (args) => {
    if (args.planOnly) {
      const raw: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(args)) {
        if (typeof value === "string") raw[key] = value;
      }
      return json(describeQueryPlan(raw));
    }
    const raw: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string") raw[key] = value;
    }
    const report = await engine.runInvestigation(raw);
    return json({ id: report.id, status: report.status, html: `~/.spectra-desk/cases/${report.id}/REPORT.html` });
  },
);

server.tool(
  "divide",
  "Show the corroboration matrix. Homonym drops stay off the client brief.",
  { reportId: z.string() },
  async ({ reportId }) => {
    const report = engine.getReport(reportId);
    if (!report) return { content: [{ type: "text" as const, text: "Report not found" }], isError: true };
    return json(report.corroboration || { note: "No matrix. Run intake on v9." });
  },
);

server.tool(
  "brief",
  "Return the client brief markdown. Probe noise stays on the workbench.",
  { reportId: z.string() },
  async ({ reportId }) => {
    const report = engine.getReport(reportId);
    if (!report) return { content: [{ type: "text" as const, text: "Report not found" }], isError: true };
    return json({
      id: report.id,
      template: report.briefTemplate || "client",
      markdown: report.clientMarkdown || report.markdown,
      claims: report.claimLedger?.rows.length || 0,
    });
  },
);

server.tool(
  "lock",
  "Refuse. Agents cannot LOCK. A person confirms LOCKED in the desk.",
  { reportId: z.string() },
  async () => ({
    content: [{ type: "text" as const, text: "Agents cannot LOCK. You confirm LOCKED. The machine does not." }],
    isError: true,
  }),
);

server.tool(
  "export_case",
  "Return ledger and Merkle status for a case. Does not LOCK.",
  { reportId: z.string() },
  async ({ reportId }) => {
    const report = engine.getReport(reportId);
    if (!report) return { content: [{ type: "text" as const, text: "Report not found" }], isError: true };
    return json({ id: report.id, claimLedger: report.claimLedger || null, merkleSeal: report.merkleSeal || null });
  },
);

server.tool("doctor", "Run the local Spectra Desk doctor. No network.", {}, async () => json(await runDoctor()));

server.tool(
  "toolkit_search",
  "Search the real toolkit catalog by text.",
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit }) => json({ toolCount: toolkitStats().toolCount, tools: listToolkitTools({ query, limit: limit || 20 }) }),
);

server.tool(
  "case_desk",
  "List cases or seed the labeled DEMO composite. Destroy and LOCK stay with the human.",
  { action: z.enum(["list", "demo"]).optional() },
  async ({ action }) => json(action === "demo" ? seedDemo() : { cases: listCaseIndex() }),
);

await server.connect(new StdioServerTransport());
