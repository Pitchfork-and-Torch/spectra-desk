/**
 * Client-ready dossier report (v8.0.2+)
 * Print-first professional brief: light paper theme, high contrast, Letter-ready.
 * Dark UI theme is intentionally NOT used for client PDF (unreadable when printed).
 */
import type { OsintReport } from "../types.js";
import { SPECTRA_VERSION, spectraGhostFaviconDataUri, spectraGhostSvg } from "./spectra-brand.js";
import { fullName, locationLine } from "./subject.js";
import type { AttributionGateResult } from "./attribution-gate.js";
import type { BusinessResolution } from "./business-entity.js";
import type { LifeTimeline } from "./life-timeline.js";
import type { SemanticCorpusAnalysis } from "./semantic-content.js";
import type { IdentityLockResult } from "./multi-signal-scorer.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TIER_COLOR: Record<string, string> = {
  locked: "#047857",
  probable: "#0369a1",
  possible: "#b45309",
  insufficient: "#b91c1c",
  LOCKED: "#047857",
  ATTRIBUTED: "#047857",
  LIKELY: "#0369a1",
  POSSIBLE: "#b45309",
  QUARANTINED: "#64748b",
  WEAK: "#94a3b8",
  confirmed: "#047857",
  likely: "#0369a1",
  possible_conf: "#b45309",
};

function tierLabel(status: string): string {
  const m: Record<string, string> = {
    locked: "LOCKED",
    probable: "PROBABLE",
    possible: "POSSIBLE",
    insufficient: "INSUFFICIENT",
  };
  return m[status] || status.toUpperCase();
}

export interface ClientReportContext {
  gate: AttributionGateResult;
  semantic: SemanticCorpusAnalysis;
  businesses: BusinessResolution;
  timeline: LifeTimeline;
  identityLock: IdentityLockResult;
}

export function buildClientExecutiveSummary(
  report: OsintReport,
  ctx: ClientReportContext,
): string {
  const name = fullName(report.subject) || "Subject";
  const loc = locationLine(report.subject);
  const lock = ctx.identityLock;
  const biz = ctx.businesses.primary;
  const parts: string[] = [];

  parts.push(
    `${name}${loc ? ` of ${loc}` : ""} is assessed at **${tierLabel(lock.status)}** confidence (${lock.score}/100) from public-source multi-signal fusion.`,
  );

  if (biz && biz.strength !== "weak") {
    parts.push(
      `Primary professional identity links to **${biz.legalName}**${biz.role ? ` (${biz.role})` : ""}${biz.industry ? ` - ${biz.industry}` : ""} [${biz.strength}].`,
    );
  }

  if (ctx.timeline.narrativeArc) {
    parts.push(ctx.timeline.narrativeArc.split(/(?<=\.)\s+/).slice(0, 2).join(" "));
  }

  const mainAccounts = ctx.gate.mainAccounts;
  if (mainAccounts.length) {
    parts.push(
      `High-confidence digital accounts: ${mainAccounts
        .slice(0, 4)
        .map((a) => `${a.platform} @${a.username}`)
        .join(", ")}.`,
    );
  } else {
    parts.push(
      `${ctx.gate.stats.probesAppendix} username probes remain unverified existence-only and are omitted from the main body.`,
    );
  }

  parts.push(
    `_Public sources only. Investigative lead, not legal proof of identity. You confirm LOCKED. The machine does not._`,
  );

  return parts.filter(Boolean).join(" ");
}

export function buildClientReportMarkdown(report: OsintReport, ctx: ClientReportContext): string {
  const name = fullName(report.subject) || "Subject";
  const lock = ctx.identityLock;
  const exec = buildClientExecutiveSummary(report, ctx);
  const lines: string[] = [
    `# Spectra Desk Intelligence Brief: ${name}`,
    "",
    `**Case ID:** \`${report.id}\`  `,
    `**Confidence:** ${tierLabel(lock.status)} · ${lock.score}/100  `,
    `**Generated:** ${report.completedAt || report.createdAt}  `,
    `**Engine:** Spectra Desk v${SPECTRA_VERSION}`,
    "",
    "---",
    "",
    "## 1. Executive Summary",
    "",
    exec,
    "",
    "## 2. Identity Confirmation & Disambiguation",
    "",
    `- **Status:** ${tierLabel(lock.status)} (${lock.lockedBy || "unconfirmed"})`,
    `- **Score:** ${lock.score}/100 (structural ${lock.structuralScore} · content ${lock.contentScore} · visual ${lock.visualScore})`,
    `- **Homonym risk:** ${report.disambiguation.homonymRisk}`,
    `- **Continuity:** ${ctx.timeline.continuityAssessment}`,
    "",
    "### Supporting signals",
    ...lock.rationale.slice(0, 10).map((r) => `- ${r}`),
    "",
  ];

  if (lock.contradictions.length) {
    lines.push("### Contradictions / demotions", ...lock.contradictions.map((c) => `- ${c}`), "");
  }

  if (ctx.timeline.personaStages.length) {
    lines.push("### Persona / life stages", "");
    for (const s of ctx.timeline.personaStages) {
      lines.push(`- **${s.stage}** (${s.supportCount} hits) - ${s.summary}`);
    }
    lines.push("");
  }

  lines.push("## 3. Professional & Business Profile", "");
  if (ctx.businesses.entities.length) {
    for (const e of ctx.businesses.entities.filter((x) => x.strength !== "weak").slice(0, 4)) {
      lines.push(
        `### ${e.legalName}`,
        `- **Link strength:** ${e.strength} (${e.confidence})`,
        e.role ? `- **Role:** ${e.role}` : "",
        e.industry ? `- **Industry:** ${e.industry}` : "",
        e.domain ? `- **Domain:** ${e.domain}` : "",
        e.locations.length ? `- **Locations:** ${e.locations.join("; ")}` : "",
        ...e.personLinkRationale.map((r) => `- ${r}`),
        e.sourceUrls[0] ? `- Source: ${e.sourceUrls[0]}` : "",
        "",
      );
    }
  } else {
    lines.push("_No fused business entity at main-report confidence._", "");
  }

  lines.push("## 4. Public Records & Life Timeline", "", ctx.timeline.narrativeArc, "");
  for (const e of ctx.timeline.events.slice(0, 12)) {
    lines.push(
      `- **${e.dateLabel}** - ${e.title} [${e.confidence}]${e.sourceUrl ? ` · ${e.sourceUrl}` : ""}`,
    );
    if (e.description) lines.push(` - ${e.description.slice(0, 220)}`);
  }
  lines.push("");

  lines.push("## 5. Digital Footprint (high confidence only)", "");
  if (ctx.gate.mainAccounts.length) {
    for (const a of ctx.gate.mainAccounts) {
      lines.push(
        `- **${a.platform}** [@${a.username}](${a.url}) - ${a.tier} ${a.posterior}% - ${a.verificationNote}`,
      );
      if (a.contentSummary) lines.push(` - ${a.contentSummary}`);
    }
  } else {
    lines.push("_No accounts met multi-signal attribution thresholds for the main report._");
  }
  lines.push("");
  lines.push(
    `_${ctx.gate.stats.probesAppendix} unverified username probes archived (not shown). Enable investigator appendix if needed._`,
    "",
  );

  lines.push("## 6. Collection Gaps & Analyst Next Steps", "");
  for (const q of ctx.timeline.openQuestions) lines.push(`- ${q}`);
  for (const a of lock.nextActions.slice(0, 6)) lines.push(`- ${a}`);
  lines.push("");

  if (report.chainOfCustody) {
    lines.push(
      "## 7. Evidence Integrity",
      "",
      `- Tool: ${report.chainOfCustody.tool}`,
      `- Evidence items: ${report.chainOfCustody.evidenceCount}`,
      `- Manifest SHA-256: \`${report.chainOfCustody.manifestHash}\``,
      `- Algorithm: ${report.chainOfCustody.algorithm}`,
      "",
    );
  }

  if (report.claimLedger?.rows.length) {
    lines.push("## Claim ledger", "");
    for (const row of report.claimLedger.rows.slice(0, 24)) {
      lines.push(`- ${row.sentence}`);
      lines.push(` - source: ${row.sourceUrl}`);
      lines.push(` - captured: ${row.capturedAt}`);
      lines.push(` - sha256: ${row.sha256}`);
      lines.push(` - band: ${row.band}`);
    }
    lines.push("");
  }
  if (report.pinnedNotes) {
    lines.push("## Pinned notes", "", report.pinnedNotes, "");
  }
  lines.push(
    "---",
    "",
    "_Public sources only. Investigative lead, not legal proof of identity. You confirm LOCKED. The machine does not._",
    "",
  );

  return lines.filter((l) => l !== undefined).join("\n");
}

/** Print-first CSS: system fonts only (no Google Fonts - PDF render must not wait on network). */
function clientPrintStyles(): string {
  return `
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:11pt}
body{
  font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  color:#0f172a;
  background:#ffffff;
  line-height:1.55;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}
.page{max-width:7.5in;margin:0 auto;padding:0.15in 0.1in 0.4in}
.legal-bar{
  font-size:7.5pt;color:#475569;text-align:center;
  padding:6px 10px;border-bottom:1px solid #cbd5e1;
  background:#f8fafc;margin-bottom:14px;
}
.brand-line{display:flex;align-items:center;gap:8px;margin-bottom:12px;color:#5b21b6;font-size:9.5pt;font-weight:600}
.brand-line .logo-ghost{flex-shrink:0}
.hero{
  display:grid;grid-template-columns:1.1in 1fr;gap:14px;align-items:start;
  padding:14px 16px;border:1px solid #c7d2fe;border-radius:8px;
  /* Solid fills only - PDF engines often drop gradients and leave black voids */
  background:#eef2ff;
  margin-bottom:18px;
}
.hero img,.hero .ph{
  width:1.1in;height:1.1in;border-radius:6px;object-fit:cover;
  background:#e2e8f0;border:1px solid #cbd5e1;
  display:flex;align-items:center;justify-content:center;
  color:#64748b;font-size:8pt;text-align:center;padding:4px;
}
h1{font-size:18pt;font-weight:700;color:#0f172a;letter-spacing:-0.01em;line-height:1.2}
.sub{color:#475569;font-size:9.5pt;margin-top:4px}
.mono{font-family:Consolas,"Courier New",monospace;font-size:8.5pt;word-break:break-all}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{
  font-size:8pt;font-weight:600;padding:3px 8px;border-radius:999px;
  border:1px solid #cbd5e1;background:#fff;color:#0f172a;
}
.chip.tier{border-width:1.5px}
h2{
  font-size:11.5pt;font-weight:700;color:#0f172a;
  margin:18px 0 8px;padding-bottom:4px;
  border-bottom:2px solid #6366f1;
  page-break-after:avoid;
}
h3{font-size:10pt;font-weight:650;color:#1e293b;margin:10px 0 4px;page-break-after:avoid}
.card{
  background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;
  padding:12px 14px;margin-bottom:10px;
  page-break-inside:avoid;
}
.card p{margin:0 0 6px;color:#1e293b;font-size:10pt}
.muted{color:#64748b}.small{font-size:8.5pt}
.badge{
  display:inline-block;font-size:7.5pt;font-weight:700;
  letter-spacing:0.04em;text-transform:uppercase;
  padding:1px 6px;border-radius:3px;background:#f1f5f9;
}
ul{margin:4px 0 4px 1.1em}li{margin:3px 0;color:#1e293b;font-size:9.5pt}
ul.clean{list-style:none;margin-left:0}
ul.clean li{padding:5px 0;border-bottom:1px solid #f1f5f9}
table{width:100%;border-collapse:collapse;font-size:9pt;margin:6px 0}
th,td{text-align:left;padding:6px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#0f172a}
th{color:#475569;font-size:7.5pt;text-transform:uppercase;letter-spacing:0.04em;background:#f8fafc}
a{color:#0369a1;text-decoration:none;word-break:break-word}
.tl-item{
  display:grid;grid-template-columns:0.7in 1fr;gap:10px;
  padding:8px 0;border-bottom:1px solid #e2e8f0;
  page-break-inside:avoid;
}
.tl-date{font-size:8.5pt;color:#5b21b6;font-weight:700}
.tl-body strong{display:block;font-size:9.5pt;color:#0f172a;margin-bottom:2px}
.tl-body p{font-size:8.5pt;color:#475569;margin:2px 0}
.stages{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.stage{
  background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;
  padding:8px 10px;min-width:1.6in;flex:1 1 28%;
  page-break-inside:avoid;
}
.stage strong{display:block;font-size:8.5pt;color:#0f172a;text-transform:capitalize}
.stage .cnt{float:right;color:#4f46e5;font-size:8pt;font-weight:700}
.stage p{clear:both;font-size:7.5pt;color:#64748b;margin-top:4px}
.biz-grid{display:grid;grid-template-columns:1fr;gap:8px}
.biz-card h3{margin-top:2px;font-size:11pt}
.footer{
  margin-top:20px;padding-top:10px;border-top:1px solid #cbd5e1;
  font-size:7.5pt;color:#64748b;
}
.footer p{margin:3px 0}
.score-line{font-size:9.5pt;margin-bottom:6px}
.section{page-break-inside:avoid}
@page { size: letter; margin: 0.6in; }
.running-head { font-size: 8pt; letter-spacing: 0.04em; color: #0e7490; margin: 0 0 8px; }
@media print{
  body{background:#fff}
  .page{max-width:none;padding:0}
  a{color:#0369a1}
  h2{break-after:avoid}
  .card,.hero,.tl-item,.stage,.biz-card,.section{break-inside:avoid; page-break-inside:avoid}
}
`;
}

function v9BriefHtml(report: OsintReport): string {
  const matrix = report.corroboration;
  const ledger = report.claimLedger;
  const rows = (matrix?.rows || [])
    .map((row) => {
      const drop = row.dropReason ? ` Drop: ${esc(row.dropReason)}.` : "";
      return `<tr><td>${esc(row.label)}</td><td>${esc(row.role)}</td><td>${esc(row.band)}</td><td>${row.anchorCount}</td><td>${row.promotedToBrief ? "brief" : "workbench"}${drop}</td></tr>`;
    })
    .join("");
  const claims = (ledger?.rows || [])
    .slice(0, 24)
    .map(
      (row) =>
        `<tr><td>${esc(row.sentence)}</td><td><a href="${esc(row.sourceUrl)}">${esc(row.sourceUrl)}</a></td><td>${esc(row.capturedAt)}</td><td class="mono">${esc(row.sha256)}</td><td>${esc(row.band)}</td></tr>`,
    )
    .join("");
  const seal = report.merkleSeal?.root
    ? `<p class="mono small">Merkle root: ${esc(report.merkleSeal.root)}</p>`
    : `<p class="muted small">Merkle seal waits for a human LOCK.</p>`;
  const notes = report.pinnedNotes ? `<h2>Pinned notes</h2><div class="card"><p>${esc(report.pinnedNotes)}</p></div>` : "";
  return `<section class="section">
    <h2>Corroboration matrix</h2>
    <div class="card">
      <table><thead><tr><th>Identity</th><th>Role</th><th>Band</th><th>Anchors</th><th>Where</th></tr></thead><tbody>${rows}</tbody></table>
      ${matrix?.mergeRefused ? `<p>Merge refused. ${esc(matrix.mergeReason || "")}</p>` : ""}
    </div>
  </section>
  <section class="section">
    <h2>Claim ledger</h2>
    <div class="card">
      <table><thead><tr><th>Sentence</th><th>Source</th><th>Captured</th><th>SHA-256</th><th>Band</th></tr></thead><tbody>${claims}</tbody></table>
      ${seal}
    </div>
  </section>
  ${notes}`;
}

export function buildClientReportHtml(report: OsintReport, ctx: ClientReportContext): string {
  const name = fullName(report.subject) || "Subject";
  const lock = ctx.identityLock;
  const exec = buildClientExecutiveSummary(report, ctx).replace(/\*\*/g, "").replace(/_/g, "");
  const portrait =
    report.dossier?.photos?.[0] ||
    report.portraitIntel?.anchorPortrait ||
    report.portraitIntel?.candidates?.[0];
  const portraitSrc =
    portrait && "dataUri" in portrait ? portrait.dataUri || portrait.imageUrl : portrait?.imageUrl;
  const statusColor = TIER_COLOR[lock.status] || "#b45309";

  // Client view: non-weak businesses only; collapse near-duplicates by org key
  const seenBiz = new Set<string>();
  const bizList = ctx.businesses.entities
    .filter((e) => e.strength !== "weak")
    .filter((e) => {
      const k = e.legalName
        .toLowerCase()
        .replace(/\b(llc|inc\.?)\b/g, "")
        .replace(/[^a-z0-9]+/g, "")
        .trim();
      if (!k || seenBiz.has(k)) return false;
      // Drop person-sentence leftovers
      if (/\bowner of\b|daprizio owner/i.test(e.legalName)) return false;
      seenBiz.add(k);
      return true;
    })
    .slice(0, 2);
  const bizCards = bizList.length
    ? `<div class="biz-grid">${bizList
        .map(
          (e) => `<div class="card biz-card">
      <span class="badge" style="color:${TIER_COLOR[e.strength.toUpperCase()] || TIER_COLOR.LIKELY};border:1px solid currentColor">${esc(e.strength.toUpperCase())}</span>
      <h3>${esc(e.legalName)}</h3>
      ${e.role ? `<p class="muted small">${esc(e.role)}</p>` : ""}
      ${e.industry ? `<p>${esc(e.industry)}</p>` : ""}
      ${e.locations.length ? `<p class="small muted">${esc(e.locations.join(" · "))}</p>` : ""}
      <ul>${e.personLinkRationale
        .slice(0, 5)
        .map((r) => `<li>${esc(r)}</li>`)
        .join("")}</ul>
      ${e.sourceUrls[0] ? `<p class="small"><a href="${esc(e.sourceUrls[0])}">${esc(e.sourceUrls[0].replace(/^https?:\/\//, "").slice(0, 60))}</a></p>` : ""}
    </div>`,
        )
        .join("")}</div>`
    : `<div class="card muted">No high-confidence business entity fused from public sources.</div>`;

  const timelineHtml = ctx.timeline.events
    .slice(0, 10)
    .map(
      (e) => `<div class="tl-item">
      <div class="tl-date">${esc(e.dateLabel)}</div>
      <div class="tl-body">
        <strong>${esc(e.title)}</strong>
        <span class="badge" style="color:${TIER_COLOR[e.confidence] || "#64748b"}">${e.confidence}</span>
        <p>${esc(e.description.slice(0, 260))}</p>
        ${e.sourceUrl ? `<a class="small" href="${esc(e.sourceUrl)}">${esc(e.sourceLabel || "source")}</a>` : ""}
      </div>
    </div>`,
    )
    .join("");

  const accountsHtml = ctx.gate.mainAccounts.length
    ? `<table><thead><tr><th>Platform</th><th>Handle</th><th>Tier</th><th>Verification</th></tr></thead><tbody>
      ${ctx.gate.mainAccounts
        .map(
          (a) => `<tr>
        <td>${esc(a.platform)}</td>
        <td class="mono"><a href="${esc(a.url)}">@${esc(a.username)}</a>
        ${a.contentSummary ? `<div class="muted small">${esc(a.contentSummary)}</div>` : ""}</td>
        <td><span class="badge" style="color:${TIER_COLOR[a.tier] || "#0369a1"}">${a.tier}</span> ${a.posterior}%</td>
        <td class="muted small">${esc(a.verificationNote)}</td>
      </tr>`,
        )
        .join("")}
    </tbody></table>`
    : `<p class="muted">No accounts met multi-signal attribution thresholds. ${ctx.gate.stats.probesAppendix} existence-only probes archived.</p>`;

  const mediaHtml = ctx.gate.mainMedia.length
    ? `<ul class="clean">${ctx.gate.mainMedia
        .map(
          (m) =>
            `<li><a href="${esc(m.url)}">${esc(m.title.slice(0, 120))}</a>
            <span class="muted small"> · ${esc(m.outlet)}${m.date ? ` · ${esc(m.date)}` : ""}</span>
            ${m.snippet ? `<div class="muted small">${esc(m.snippet.slice(0, 140))}</div>` : ""}</li>`,
        )
        .join("")}</ul>`
    : "";

  const stagesHtml = ctx.timeline.personaStages
    .slice(0, 6)
    .map(
      (s) =>
        `<div class="stage"><span class="cnt">${s.supportCount}</span><strong>${esc(s.stage)}</strong><p>${esc(s.summary)}</p></div>`,
    )
    .join("");

  const gaps = [...new Set([...ctx.timeline.openQuestions, ...lock.nextActions])].slice(0, 8);

  const portraitBlock = portraitSrc
    ? `<img src="${portraitSrc.startsWith("data:") ? portraitSrc : esc(portraitSrc)}" alt="Subject portrait"/>`
    : `<div class="ph">No<br/>portrait</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(name)} - Spectra Desk Client Brief</title>
<link rel="icon" type="image/svg+xml" href="${spectraGhostFaviconDataUri()}"/>
<meta name="generator" content="Spectra Desk v${SPECTRA_VERSION}"/>
<style>${clientPrintStyles()}</style>
</head>
<body>
<div class="legal-bar">Public sources only · Investigative lead - not legal proof of identity · Verify independently · Spectra Desk v${SPECTRA_VERSION}</div>
<div class="page">
<p class="running-head">Spectra Desk - investigative lead, not legal proof</p>
  <div class="brand-line">${spectraGhostSvg(18)} Spectra Desk · Client Intelligence Brief · v${SPECTRA_VERSION}</div>
  <header class="hero">
    ${portraitBlock}
    <div>
      <h1>${esc(name)}</h1>
      <p class="sub">${esc(locationLine(report.subject) || "Location not specified")} · <span class="mono">${esc(report.id)}</span></p>
      <div class="meta">
        <span class="chip tier" style="color:${statusColor};border-color:${statusColor}"><strong>${tierLabel(lock.status)}</strong> · ${lock.score}/100</span>
        <span class="chip">homonym: ${esc(report.disambiguation.homonymRisk)}</span>
        <span class="chip">${ctx.gate.stats.hitsMain} primary sources</span>
        <span class="chip">${ctx.gate.mainAccounts.length} attributed accounts</span>
        <span class="chip">${ctx.gate.stats.probesAppendix} probes archived</span>
      </div>
    </div>
  </header>

  <section class="section">
    <h2>1. Executive Summary</h2>
    <div class="card"><p>${esc(exec)}</p></div>
  </section>

  <section class="section">
    <h2>2. Identity Confirmation &amp; Disambiguation</h2>
    <div class="card">
      <p class="score-line"><strong style="color:${statusColor}">${tierLabel(lock.status)}</strong>
 - structural ${lock.structuralScore} · content ${lock.contentScore} · visual ${lock.visualScore}
      ${lock.businessScore != null ? ` · business ${lock.businessScore}` : ""}
      ${lock.officialRecordScore != null ? ` · records ${lock.officialRecordScore}` : ""}
      ${lock.scoreCapApplied ? ` · cap @ ${lock.scoreCapApplied}` : ""}</p>
      <p class="muted small">${esc(ctx.timeline.continuityAssessment)}</p>
      <ul>${lock.rationale
        .slice(0, 8)
        .map((r) => `<li>${esc(r)}</li>`)
        .join("")}</ul>
      ${ctx.timeline.personaStages.length ? `<div class="stages">${stagesHtml}</div>` : ""}
    </div>
  </section>

  <section class="section">
    <h2>3. Professional &amp; Business Profile</h2>
    ${bizCards}
  </section>

  <section class="section">
    <h2>4. Public Records &amp; Life Timeline</h2>
    <div class="card">
      <p style="margin-bottom:10px">${esc(ctx.timeline.narrativeArc)}</p>
      ${timelineHtml || `<p class="muted">No chronological events synthesized.</p>`}
      ${mediaHtml ? `<h3>Media &amp; records highlights</h3>${mediaHtml}` : ""}
    </div>
  </section>

  <section class="section">
    <h2>5. Digital Footprint</h2>
    <div class="card">
      ${accountsHtml}
      <p class="muted small" style="margin-top:8px">${ctx.gate.stats.probesAppendix} unverified username probes omitted (existence ≠ attribution).</p>
    </div>
  </section>

  <section class="section">
    <h2>6. Collection Gaps &amp; Next Steps</h2>
    <div class="card">
      <ul>${gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
    </div>
  </section>

  <section class="section">
    <h2>7. Evidence Integrity</h2>
    <div class="card">
      ${
        report.chainOfCustody
          ? `<p>Tool: <strong>${esc(report.chainOfCustody.tool)}</strong> · Evidence items: <strong>${report.chainOfCustody.evidenceCount}</strong></p>
             <p class="mono small">Manifest SHA-256: ${esc(report.chainOfCustody.manifestHash)}</p>
             <p class="muted small">${esc(report.chainOfCustody.algorithm)}</p>`
          : `<p class="muted">Chain of custody not available.</p>`
      }
    </div>
  </section>

  ${v9BriefHtml(report)}

  <footer class="footer">
    <p>Spectra Desk v${SPECTRA_VERSION} · Case ${esc(report.id)} · Generated ${esc(report.completedAt || report.createdAt)}</p>
    <p>Public sources only. Investigative lead, not legal proof of identity. You confirm LOCKED. The machine does not.</p>
  </footer>
</div>
</body>
</html>`;
}
