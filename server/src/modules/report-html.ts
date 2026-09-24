import type { OsintReport } from "../types.js";
import { buildReportBasename } from "./report-filename.js";
import { SPECTRA_VERSION, spectraBrandRow, spectraGhostFaviconDataUri, spectraGhostSvg } from "./spectra-brand.js";
import { fullName } from "./subject.js";
import { buildDossierHtmlSection } from "./dossier-html.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .replace(/^[A-Za-z]+ [a-z]+\.[a-z]+ ›.*?(?=\s{2,}|$)/, "")
    .trim()
    .slice(0, 140);
}

function statusClass(status: string): string {
  if (status === "verified" || status === "found") return "ok";
  if (status === "possible") return "warn";
  return "muted";
}

function homonymNote(data: Omit<OsintReport, "markdown" | "html">): string | null {
  const anchor = (data.subject.employer || data.subject.username || "").toLowerCase();
  if (!anchor) return null;
  const hits = data.searchHits.map((h) => h.url + h.title).join(" ").toLowerCase();
  const anchorInHits = hits.includes(anchor.replace(/^https?:\/\//, ""));
  const famousNoise = /epicvoiceguy|voice actor|imdb|transformers|tiktok/i.test(hits);
  if (famousNoise && !anchorInHits && data.disambiguation.score >= 70) {
    return `Analyst note: High disambiguation score (${data.disambiguation.score}) but results mix multiple public figures named "${fullName(data.subject)}". Anchor signals (${anchor}) did not dominate top hits - manual refinement recommended.`;
  }
  return null;
}

export function buildReportHtml(data: Omit<OsintReport, "markdown" | "html">): string {
  const name = fullName(data.subject) || "Subject";
  const fileBasename = data.exportBasename || buildReportBasename(data.subject, data.completedAt || data.createdAt);
  const created = new Date(data.createdAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const completed = data.completedAt
    ? new Date(data.completedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : " - ";
  const socialFound = data.socialCandidates.filter((s) => s.status === "found" || s.status === "verified");
  const note = data.investigatorBrief?.confidenceTier === "uncertain"
    ? data.investigatorBrief.assessment
    : homonymNote(data);
  const tierColor: Record<string, string> = {
    confirmed: "#34d399",
    likely: "#22d3ee",
    uncertain: "#fbbf24",
    insufficient: "#f87171",
  };

  const subjectFields = [
    ["Name", name],
    ["Username", data.subject.username],
    ["Employer / Site", data.subject.employer],
    ["Email", data.subject.email],
    ["Location", [data.subject.city, data.subject.state, data.subject.country].filter(Boolean).join(", ")],
    ["Notes", data.subject.notes],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const scoreOffset = 283 - (data.disambiguation.score / 100) * 283;
  const riskColor =
    data.disambiguation.homonymRisk === "high"
      ? "#f87171"
      : data.disambiguation.homonymRisk === "medium"
        ? "#fbbf24"
        : "#34d399";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(fileBasename)} - Spectra OSINT Brief</title>
<link rel="icon" type="image/svg+xml" href="${spectraGhostFaviconDataUri()}"/>
<meta name="description" content="Spectra Desk OSINT brief for ${esc(name)} - public sources only"/>
<meta property="og:title" content="${esc(name)} - Spectra Desk OSINT Brief"/>
<meta property="og:description" content="Investigator-grade public-source OSINT brief · ${esc(data.id)}"/>
<meta property="og:type" content="article"/>
<meta name="generator" content="Spectra Desk v${SPECTRA_VERSION}"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
:root{
  --bg:#06080f;--surface:#0d111c;--card:#121829;--card2:#171f33;
  --border:rgba(148,163,184,.12);--text:#e8edf7;--muted:#8b9cb8;
  --cyan:#22d3ee;--violet:#a78bfa;--green:#34d399;--amber:#fbbf24;--red:#f87171;
  --grad:linear-gradient(135deg,#22d3ee 0%,#818cf8 50%,#c084fc 100%);
  --shadow:0 4px 24px rgba(0,0,0,.45);
  --radius:14px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.65;min-height:100vh}
body::before{content:'';position:fixed;inset:0;background:
  radial-gradient(ellipse 80% 50% at 20% -10%,rgba(34,211,238,.12),transparent),
  radial-gradient(ellipse 60% 40% at 90% 10%,rgba(167,139,250,.1),transparent),
  radial-gradient(ellipse 50% 30% at 50% 100%,rgba(129,140,248,.06),transparent);
  pointer-events:none;z-index:0}
a{color:var(--cyan);text-decoration:none;transition:color .15s}
a:hover{color:#67e8f9;text-decoration:underline}
code,.mono{font-family:'JetBrains Mono',monospace;font-size:.82em}
.layout{display:grid;grid-template-columns:240px 1fr;max-width:1280px;margin:0 auto;position:relative;z-index:1}
@media(max-width:900px){.layout{grid-template-columns:1fr}.side{position:static!important;height:auto!important;border-right:none!important;border-bottom:1px solid var(--border)}.side nav{display:flex;flex-wrap:wrap;gap:.35rem;padding:1rem}}
.side{position:sticky;top:0;height:100vh;padding:1.75rem 1.25rem;border-right:1px solid var(--border);background:rgba(6,8,15,.85);backdrop-filter:blur(12px)}
.brand{font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:.25rem}
.brand-row{display:inline-flex;align-items:center;gap:.45rem}
.logo-ghost{flex-shrink:0;display:block;filter:drop-shadow(0 0 6px rgba(167,139,250,.35))}
.side h2{font-size:1rem;font-weight:600;margin-bottom:1.25rem;color:var(--muted)}
.side nav a{display:block;padding:.45rem .65rem;border-radius:8px;color:var(--muted);font-size:.88rem;margin-bottom:.15rem}
.side nav a:hover{background:rgba(34,211,238,.08);color:var(--cyan);text-decoration:none}
main{padding:2rem 2.5rem 4rem}
@media(max-width:600px){main{padding:1.25rem}}
.hero{margin-bottom:2rem}
.hero-brand{display:flex;align-items:center;gap:.65rem;margin-bottom:.75rem}
.hero-brand .brand-text{font-size:.68rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero h1{font-size:clamp(2rem,5vw,2.75rem);font-weight:700;letter-spacing:-.03em;line-height:1.15;margin-bottom:.5rem}
.hero h1 span{background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.meta{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0 1rem}
.chip{display:inline-flex;align-items:center;gap:.35rem;padding:.3rem .75rem;border-radius:999px;font-size:.78rem;font-weight:500;border:1px solid var(--border);background:rgba(18,24,41,.8)}
.chip strong{color:var(--text)}
.chip.cyan{border-color:rgba(34,211,238,.25);color:var(--cyan)}
.chip.violet{border-color:rgba(167,139,250,.25);color:var(--violet)}
.chip.green{border-color:rgba(52,211,153,.25);color:var(--green)}
.alert{padding:1rem 1.15rem;border-radius:var(--radius);border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.08);color:#fde68a;margin-bottom:1.5rem;font-size:.92rem}
.alert strong{color:#fbbf24}
section{margin-bottom:2.5rem;scroll-margin-top:1.5rem}
section>h2{font-size:1.15rem;font-weight:600;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem}
section>h2::before{content:'';width:3px;height:1.1em;background:var(--grad);border-radius:2px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem 1.35rem;box-shadow:var(--shadow)}
.card+.card{margin-top:.85rem}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:700px){.grid2{grid-template-columns:1fr}}
.dash{display:grid;grid-template-columns:auto 1fr;gap:1.5rem;align-items:center}
.gauge{width:120px;height:120px;position:relative}
.gauge svg{transform:rotate(-90deg)}
.gauge-val{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.gauge-val .n{font-size:1.75rem;font-weight:700;color:var(--cyan);line-height:1}
.gauge-val .l{font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.kv{display:grid;grid-template-columns:120px 1fr;gap:.35rem .75rem;font-size:.9rem}
.kv dt{color:var(--muted)}
.kv dd{color:var(--text)}
ul.clean{list-style:none}
ul.clean li{padding:.35rem 0;padding-left:1rem;position:relative;color:var(--muted);font-size:.92rem}
ul.clean li::before{content:'›';position:absolute;left:0;color:var(--cyan)}
.candidates{display:grid;gap:.65rem}
.cand{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:.85rem 1rem;background:var(--card2);border:1px solid var(--border);border-radius:10px}
.cand a{font-weight:500;color:var(--text)}
.cand a:hover{color:var(--cyan)}
.score-pill{font-family:'JetBrains Mono',monospace;font-size:.75rem;padding:.2rem .55rem;border-radius:6px;background:rgba(34,211,238,.12);color:var(--cyan);white-space:nowrap}
.hits{display:grid;gap:.65rem}
.hit{display:grid;grid-template-columns:auto 1fr auto;gap:.75rem 1rem;padding:1rem;background:var(--card2);border:1px solid var(--border);border-radius:10px;align-items:start}
.hit-n{font-family:'JetBrains Mono',monospace;font-size:.75rem;color:var(--muted);padding-top:.15rem}
.hit-body h3{font-size:.95rem;font-weight:500;margin-bottom:.25rem;line-height:1.35}
.hit-body h3 a{color:var(--text)}
.hit-body h3 a:hover{color:var(--cyan)}
.hit-meta{font-size:.78rem;color:var(--muted)}
.hit-meta code{background:rgba(0,0,0,.25);padding:.1rem .35rem;border-radius:4px}
.rel-bar{width:48px;height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;margin-top:.35rem}
.rel-fill{height:100%;background:var(--grad);border-radius:2px}
.social-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.65rem}
.social-item{padding:.9rem 1rem;background:var(--card2);border:1px solid var(--border);border-radius:10px}
.social-item .plat{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:.25rem}
.social-item .url{font-size:.82rem;word-break:break-all;margin-bottom:.4rem}
.badge{display:inline-block;font-size:.7rem;font-weight:600;padding:.15rem .5rem;border-radius:5px;text-transform:uppercase;letter-spacing:.04em}
.badge.ok{background:rgba(52,211,153,.15);color:var(--green)}
.badge.warn{background:rgba(251,191,36,.15);color:var(--amber)}
.badge.muted{background:rgba(139,156,184,.12);color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:.84rem}
th{text-align:left;padding:.65rem .75rem;color:var(--muted);font-weight:500;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border)}
td{padding:.65rem .75rem;border-bottom:1px solid var(--border);vertical-align:top}
tr:hover td{background:rgba(34,211,238,.03)}
.type-tag{font-size:.68rem;padding:.12rem .4rem;border-radius:4px;background:rgba(129,140,248,.15);color:var(--violet);text-transform:uppercase;letter-spacing:.04em}
.hash{color:var(--muted);font-size:.75rem}
.capture{background:rgba(0,0,0,.2);border-left:3px solid var(--violet);padding:.75rem 1rem;margin-top:.5rem;border-radius:0 8px 8px 0;font-size:.82rem;color:var(--muted);max-height:120px;overflow:auto;white-space:pre-wrap}
.inv-cat{margin-bottom:1rem}
.inv-cat h4{font-size:.85rem;color:var(--cyan);margin-bottom:.4rem}
.inv-cat ul{list-style:none;display:flex;flex-wrap:wrap;gap:.35rem}
.inv-cat li{font-size:.78rem;padding:.2rem .55rem;background:rgba(18,24,41,.9);border:1px solid var(--border);border-radius:6px}
.inv-cat li a{color:var(--muted)}
footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--border);font-size:.8rem;color:var(--muted)}
footer a{color:var(--violet)}
.topbar{position:sticky;top:0;z-index:100;background:rgba(6,8,15,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);padding:.65rem 1.25rem;display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between}
.topbar .case-id{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--muted)}
.search-box{flex:1;min-width:180px;max-width:320px}
.search-box input{width:100%;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:.45rem .75rem;color:var(--text);font-size:.85rem}
.search-box input:focus{outline:none;border-color:rgba(34,211,238,.4)}
.side nav a.active{background:rgba(34,211,238,.12);color:var(--cyan)}
.graph-grid{display:grid;gap:.5rem}
.graph-node{padding:.75rem 1rem;border-radius:10px;border:1px solid var(--border);font-size:.85rem}
.graph-node.person{border-color:rgba(167,139,250,.35);background:rgba(167,139,250,.08)}
.graph-node.account{border-color:rgba(34,211,238,.35);background:rgba(34,211,238,.06)}
.graph-node.domain{border-color:rgba(52,211,153,.35);background:rgba(52,211,153,.06)}
.graph-edge{font-size:.78rem;color:var(--muted);padding:.25rem 0 .25rem 1rem;border-left:2px solid var(--border);margin-left:.5rem}
.portrait-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:1rem;margin-top:1rem}
.portrait-card{background:var(--card2);border:1px solid var(--border);border-radius:12px;overflow:hidden;text-align:center}
.portrait-card.anchor{border-color:rgba(52,211,153,.45);box-shadow:0 0 0 1px rgba(52,211,153,.15)}
.portrait-card.distinct{border-color:rgba(248,113,113,.45);opacity:.92}
.portrait-card img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#0a0e18}
.portrait-cap{padding:.55rem .65rem;font-size:.72rem}
.portrait-cap strong{display:block;color:var(--text);font-size:.78rem;margin-bottom:.15rem}
.portrait-verdict{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;margin-top:.2rem}
.portrait-verdict.match{color:var(--green)}
.portrait-verdict.distinct{color:var(--red)}
.portrait-verdict.unknown{color:var(--muted)}
.btn-print{font-size:.75rem;padding:.35rem .75rem;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--muted);cursor:pointer}
.btn-print:hover{color:var(--cyan);border-color:rgba(34,211,238,.3)}
@media print{body::before{display:none}.side,.topbar,.search-box,.btn-print{display:none}.layout{grid-template-columns:1fr}main{padding:0}a{color:#0891b2}}
</style>
</head>
<body>
<div class="topbar">
  ${spectraBrandRow(`${esc(fileBasename)} · ${esc(data.id)}`)}
  <div class="search-box"><input type="search" id="report-search" placeholder="Search this report..." aria-label="Search report"/></div>
  <button class="btn-print" onclick="window.print()">Print / PDF</button>
</div>
<div class="layout">
<aside class="side">
  <div class="brand">Navigation</div>
  <h2>Sections</h2>
  <nav id="report-nav">
    <a href="#summary">Summary</a>
    ${data.dossier ? `<a href="#dossier">Subject Dossier</a>` : ""}
    <a href="#investigator">Investigator Brief</a>
    <a href="#disambiguation">Disambiguation</a>
    ${data.portraitIntel?.candidates.length ? `<a href="#portraits">Visual Identity</a>` : ""}
    ${data.identityGraph?.nodes.length ? `<a href="#graph">Identity Graph</a>` : ""}
    <a href="#subject">Subject</a>
    ${data.siteFingerprint ? `<a href="#site-profile">Site Profile</a>` : ""}
    ${data.personaClusters?.length ? `<a href="#personas">Personas</a>` : ""}
    <a href="#accounts">Accounts</a>
    <a href="#search">Search Hits</a>
    ${data.excludedHits?.length ? `<a href="#excluded">Excluded</a>` : ""}
    <a href="#social">Social</a>
    ${data.accountCorrelation?.mutualMetadata.length ? `<a href="#correlation">Correlation</a>` : ""}
    ${data.chainOfCustody ? `<a href="#custody">Chain of Custody</a>` : ""}
    <a href="#evidence">Evidence</a>
    <a href="#sources">Sources</a>
  </nav>
</aside>
<main>
<header class="hero" id="summary">
  <div class="hero-brand">${spectraGhostSvg(28)}<span class="brand-text">Spectra Desk · v${SPECTRA_VERSION}</span></div>
  <h1><span>${esc(name)}</span></h1>
  <p style="color:var(--muted);font-size:.95rem">OSINT intelligence brief · <code class="mono">${esc(data.id)}</code></p>
  <div class="meta">
    <span class="chip cyan"><strong>${data.disambiguation.score}</strong>/100 confidence</span>
    <span class="chip violet">${data.searchHits.length} search hits</span>
    <span class="chip green">${data.evidence.length} evidence items</span>
    ${data.portraitIntel?.candidates.length ? `<span class="chip violet">${data.portraitIntel.candidates.length} portraits</span>` : ""}
    <span class="chip">${socialFound.length} profiles</span>
    <span class="chip" style="color:${riskColor}">homonym: ${data.disambiguation.homonymRisk}</span>
    ${data.investigatorBrief ? `<span class="chip" style="color:${tierColor[data.investigatorBrief.confidenceTier] || "var(--muted)"}">tier: ${data.investigatorBrief.confidenceTier}</span>` : ""}
  </div>
  <p style="font-size:.92rem;color:var(--muted);max-width:720px">${esc(data.executiveSummary.replace(/\*\*/g, "").replace(/_/g, ""))}</p>
</header>

${note ? `<div class="alert"><strong>⚠ Analyst alert</strong> - ${esc(note)}</div>` : ""}

${data.dossier ? buildDossierHtmlSection(data.dossier) : ""}

${
  data.investigatorBrief
    ? `<section id="investigator">
  <h2>Investigator Brief</h2>
  <div class="card">
    <p style="font-size:1rem;margin-bottom:1rem">${esc(data.investigatorBrief.assessment)}</p>
    <p style="font-size:.85rem;color:var(--muted);margin-bottom:1rem"><strong style="color:${tierColor[data.investigatorBrief.confidenceTier]}">Confidence tier: ${data.investigatorBrief.confidenceTier}</strong></p>
    ${data.investigatorBrief.verificationWarnings?.length ? `<div class="alert" style="margin-bottom:1rem"><strong>⚠ Verify before formal attribution</strong><ul class="clean" style="margin-top:.5rem">${data.investigatorBrief.verificationWarnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
    <h3 style="font-size:.9rem;color:var(--cyan);margin-bottom:.5rem">Account → Name Correlation</h3>
    <table style="margin-bottom:1rem"><thead><tr><th>Platform</th><th>Account</th><th>Linked Name</th><th>Conf.</th></tr></thead><tbody>
    ${data.investigatorBrief.accountToNameLinks.map((l) => `<tr><td>${esc(l.platform)}</td><td class="mono"><a href="${esc(l.evidence)}" target="_blank" rel="noopener">@${esc(l.account)}</a></td><td>${esc(l.linkedName || " - ")}</td><td>${l.confidence}%${l.tier ? ` <span class="badge ${l.tier === "attributed" ? "ok" : l.tier === "quarantined" ? "muted" : "warn"}">${esc(l.tier)}</span>` : ""}</td></tr>`).join("")}
    </tbody></table>
    <p style="font-size:.82rem;margin-bottom:1rem">Anchors: username ${data.investigatorBrief.anchorStatus.hasUsername ? "✓" : "✗"} · email ${data.investigatorBrief.anchorStatus.hasEmail ? "✓" : "✗"} · domain ${data.investigatorBrief.anchorStatus.hasDomain ? "✓" : "✗"} · common-name ready: ${data.investigatorBrief.anchorStatus.sufficientForCommonName ? "yes" : "no"}</p>
    ${data.disambiguation.scoreBreakdown ? `<h3 style="font-size:.9rem;color:var(--cyan);margin:1rem 0 .5rem">Score Breakdown (${data.disambiguation.scoreBreakdown.finalScore}/100)</h3><table style="margin-bottom:1rem;font-size:.82rem"><thead><tr><th>Component</th><th>Δ</th></tr></thead><tbody>${data.disambiguation.scoreBreakdown.components.map((c) => `<tr><td>${esc(c.label)} <span style="color:var(--muted)">(${c.category})</span></td><td style="color:${c.delta >= 0 ? "var(--green)" : "var(--red)"}">${c.delta >= 0 ? "+" : ""}${c.delta}</td></tr>`).join("")}</tbody></table>` : ""}
    <h3 style="font-size:.9rem;color:var(--amber);margin-bottom:.5rem">Recommended Actions</h3>
    <ul class="clean">${data.investigatorBrief.recommendedActions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
    ${data.investigatorBrief.legalContacts.length ? `<h3 style="font-size:.9rem;color:var(--violet);margin:1rem 0 .5rem">Legal Contacts</h3><ul class="clean">${data.investigatorBrief.legalContacts.map((l) => `<li><strong>${esc(l.platform)}</strong> - <a href="${esc(l.lawEnforcementUrl)}" target="_blank" rel="noopener">Law enforcement guide</a></li>`).join("")}</ul>` : ""}
    <p style="margin-top:1rem;font-size:.75rem;color:var(--muted)">${esc(data.investigatorBrief.legalDisclaimer)}</p>
  </div>
</section>`
    : ""
}

<section id="subject">
  <h2>Subject Intake</h2>
  <div class="card">
    <dl class="kv">
      ${subjectFields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join("")}
    </dl>
    <p style="margin-top:1rem;font-size:.78rem;color:var(--muted)">Generated ${esc(created)} · Completed ${esc(completed)} · Status: <strong style="color:var(--green)">${esc(data.status)}</strong></p>
  </div>
</section>

${
  data.portraitIntel?.candidates.length
    ? `<section id="portraits">
  <h2>Visual Identity &amp; Portrait Disambiguation</h2>
  <div class="card">
    <p style="font-size:.92rem;margin-bottom:.75rem">${esc(data.portraitIntel.summary)}</p>
    <p style="font-size:.78rem;color:var(--muted);margin-bottom:.5rem">Method: ${esc(data.portraitIntel.method)} · ${data.portraitIntel.homonymProfiles.length} homonym profile(s) compared</p>
    <div class="portrait-grid">
      ${data.portraitIntel.candidates
        .map((p) => {
          const vc =
            p.matchVerdict === "matches-anchor" || p.matchVerdict === "likely-same"
              ? "match"
              : p.matchVerdict === "distinct-person"
                ? "distinct"
                : "unknown";
          const cardClass =
            p.role === "anchor" ? "anchor" : p.matchVerdict === "distinct-person" ? "distinct" : "";
          const img = p.dataUri ? `<img src="${p.dataUri}" alt="${esc(p.label)}" loading="lazy"/>` : `<div style="aspect-ratio:1;background:var(--card);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.7rem">No image</div>`;
          return `<div class="portrait-card ${cardClass}">
        ${img}
        <div class="portrait-cap">
          <strong>${esc(p.label)}</strong>
          <span style="color:var(--muted)">${esc(p.platform)} · ${esc(p.role)}</span>
          ${p.similarityToAnchor != null && p.role !== "anchor" ? `<div class="portrait-verdict ${vc}">${esc(p.matchVerdict)} · ${(p.similarityToAnchor * 100).toFixed(0)}%</div>` : p.role === "anchor" ? `<div class="portrait-verdict match">anchor reference</div>` : `<div class="portrait-verdict unknown">${esc(p.matchVerdict)}</div>`}
          ${p.profileUrl ? `<a href="${esc(p.profileUrl)}" target="_blank" rel="noopener" style="font-size:.68rem;display:block;margin-top:.25rem">Profile</a>` : ""}
        </div>
      </div>`;
        })
        .join("")}
    </div>
    ${
      data.portraitIntel.homonymProfiles.length
        ? `<div class="alert" style="margin-top:1rem"><strong>Homonym face profiles</strong> - generic-name accounts compared visually to the anchor. Distinct faces support quarantine decisions.<ul class="clean" style="margin-top:.5rem">${data.portraitIntel.homonymProfiles.map((h) => `<li><strong>${esc(h.label)}</strong> - ${h.distinctFromAnchor ? "visually distinct from anchor" : h.similarity != null ? `${(h.similarity * 100).toFixed(0)}% similar (review manually)` : "comparison inconclusive"}</li>`).join("")}</ul></div>`
        : ""
    }
  </div>
</section>`
    : ""
}

<section id="disambiguation">
  <h2>Disambiguation Analysis</h2>
  <div class="card dash">
    <div class="gauge">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="8"/>
        <circle cx="60" cy="60" r="45" fill="none" stroke="url(#g)" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="283" stroke-dashoffset="${scoreOffset}"/>
        <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#c084fc"/></linearGradient></defs>
      </svg>
      <div class="gauge-val"><span class="n">${data.disambiguation.score}</span><span class="l">score</span></div>
    </div>
    <div>
      <p style="font-weight:600;margin-bottom:.5rem">${esc(data.disambiguation.label)}</p>
      <ul class="clean">${data.disambiguation.rationale.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      ${data.disambiguation.distinguishingSignals.length ? `<p style="margin-top:.75rem;font-size:.85rem"><strong style="color:var(--cyan)">Signals:</strong> ${data.disambiguation.distinguishingSignals.map((s) => esc(s)).join(" · ")}</p>` : ""}
      ${data.disambiguation.refined ? `<p style="margin-top:.5rem;font-size:.82rem;color:var(--green)">✓ User refinement applied</p>` : ""}
    </div>
  </div>
</section>

${
  data.identityGraph?.nodes.length
    ? `<section id="graph">
  <h2>Identity Graph</h2>
  <div class="card">
    <div class="graph-grid">
      ${data.identityGraph.nodes.map((n) => `<div class="graph-node ${esc(n.type)}"><strong>${esc(n.label)}</strong> <span style="color:var(--muted);font-size:.72rem">${esc(n.type)} · ${n.confidence}%</span>${n.url ? `<br/><a href="${esc(n.url.startsWith("http") ? n.url : `https://${n.url}`)}" target="_blank" rel="noopener" style="font-size:.78rem">${esc(n.url)}</a>` : ""}</div>`).join("")}
    </div>
    ${data.identityGraph.edges.length ? `<div style="margin-top:1rem"><h3 style="font-size:.85rem;color:var(--violet);margin-bottom:.5rem">Relationships</h3>${data.identityGraph.edges.map((e) => { const from = data.identityGraph!.nodes.find((n) => n.id === e.from); const to = data.identityGraph!.nodes.find((n) => n.id === e.to); return `<div class="graph-edge"><strong>${esc(from?.label || e.from)}</strong> → <em>${esc(e.relation)}</em> → <strong>${esc(to?.label || e.to)}</strong> (${e.confidence}%)</div>`; }).join("")}</div>` : ""}
  </div>
</section>`
    : ""
}

${
  data.siteFingerprint
    ? `<section id="site-profile"><h2>Website Profile (v4)</h2><div class="card"><dl class="kv"><dt>Domain</dt><dd>${esc(data.siteFingerprint.domain)}</dd><dt>Pages crawled</dt><dd>${data.siteFingerprint.pagesCrawled}</dd><dt>Social links</dt><dd>${data.siteFingerprint.socialLinkCount}</dd></dl>${data.siteFingerprint.songTitles.length ? `<p style="margin-top:.75rem;font-size:.85rem"><strong>Songs:</strong> ${data.siteFingerprint.songTitles.map((s) => esc(s)).join(", ")}</p>` : ""}${data.siteFingerprint.albumTitles.length ? `<p style="font-size:.85rem"><strong>Albums:</strong> ${data.siteFingerprint.albumTitles.map((s) => esc(s)).join(", ")}</p>` : ""}${data.siteFingerprint.uniquePhrases.length ? `<p style="font-size:.85rem"><strong>Unique phrases:</strong> ${data.siteFingerprint.uniquePhrases.map((s) => esc(s)).join(" · ")}</p>` : ""}${data.domainIntel?.extractedLinks?.length ? `<h3 style="font-size:.85rem;color:var(--cyan);margin:1rem 0 .5rem">Extracted links</h3><ul class="clean">${data.domainIntel.extractedLinks.slice(0, 14).map((l) => `<li>${l.platform ? `<strong>${esc(l.platform)}</strong> ` : ""}<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a> <span style="color:var(--muted)">${l.confidence}% · ${esc(l.source)}${l.linkRole === "collaborator" ? " · associate" : l.linkRole === "self" ? " · self-claimed" : ""}</span></li>`).join("")}</ul>` : ""}</div></section>`
    : ""
}

${
  data.personaClusters?.length
    ? `<section id="personas"><h2>Persona Clusters</h2><div class="grid2">${data.personaClusters.map((p) => `<div class="card"><h3 style="font-size:.85rem;color:var(--violet)">${esc(p.label)}</h3><p style="font-size:.82rem;color:var(--muted)">${esc(p.description)}</p><p style="margin-top:.5rem">${p.accountCount} account(s) · confidence ${p.confidence}%</p></div>`).join("")}</div></section>`
    : ""
}

${
  data.usernameProbes?.filter((p) => p.exists).length || data.githubIntel || data.domainIntel
    ? `<section id="accounts">
  <h2>Account &amp; Domain Correlation</h2>
  <div class="grid2">
    ${data.githubIntel ? `<div class="card"><h3 style="font-size:.85rem;color:var(--cyan);margin-bottom:.5rem">GitHub API</h3><dl class="kv"><dt>Login</dt><dd><a href="${esc(data.githubIntel.url)}" target="_blank" rel="noopener">${esc(data.githubIntel.login)}</a></dd><dt>Name</dt><dd>${esc(data.githubIntel.name || " - ")}</dd><dt>Bio</dt><dd>${esc(data.githubIntel.bio || " - ")}</dd><dt>Blog</dt><dd>${data.githubIntel.blog ? `<a href="${esc(data.githubIntel.blog.startsWith("http") ? data.githubIntel.blog : `https://${data.githubIntel.blog}`)}" target="_blank" rel="noopener">${esc(data.githubIntel.blog)}</a>` : " - "}</dd><dt>Location</dt><dd>${esc(data.githubIntel.location || " - ")}</dd></dl>${data.githubIntel.repos?.length ? `<h4 style="font-size:.8rem;color:var(--muted);margin:1rem 0 .4rem">Recent repositories</h4><ul class="clean">${data.githubIntel.repos.map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>${r.language ? ` <span style="color:var(--violet)">· ${esc(r.language)}</span>` : ""}${r.description ? ` - ${esc(r.description.slice(0, 80))}` : ""}</li>`).join("")}</ul>` : ""}</div>` : ""}
    ${data.domainIntel ? `<div class="card"><h3 style="font-size:.85rem;color:var(--cyan);margin-bottom:.5rem">Domain Intel</h3><dl class="kv"><dt>Domain</dt><dd><a href="${esc(data.domainIntel.url)}" target="_blank" rel="noopener">${esc(data.domainIntel.domain)}</a></dd><dt>Title</dt><dd>${esc(data.domainIntel.siteTitle || " - ")}</dd><dt>Description</dt><dd>${esc(data.domainIntel.siteDescription || " - ")}</dd>${data.domainIntel.rdap?.registrar ? `<dt>Registrar</dt><dd>${esc(data.domainIntel.rdap.registrar)}</dd>` : ""}</dl></div>` : ""}
  </div>
  ${data.scoredAccounts?.filter((s) => s.linkOwnership !== "collaborator").length ? `<h3 style="font-size:.9rem;color:var(--cyan);margin:1rem 0 .5rem">Subject accounts (log-odds)</h3><table style="margin-bottom:1rem;font-size:.82rem"><thead><tr><th>Platform</th><th>Handle</th><th>Tier</th><th>Posterior</th></tr></thead><tbody>${data.scoredAccounts.filter((s) => s.linkOwnership !== "collaborator").map((s) => `<tr><td>${esc(s.platform)}</td><td class="mono"><a href="${esc(s.url)}" target="_blank" rel="noopener">@${esc(s.username)}</a>${s.displayName ? `<br/><span style="color:var(--muted);font-size:.75rem">${esc(s.displayName)}</span>` : ""}</td><td><span class="badge ${s.tier === "attributed" ? "ok" : s.tier === "quarantined" ? "muted" : "warn"}">${esc(s.tier)}</span></td><td>${(s.posterior * 100).toFixed(0)}%</td></tr>`).join("")}</tbody></table>` : ""}
  ${data.scoredAccounts?.filter((s) => s.linkOwnership === "collaborator").length ? `<div class="alert" style="margin-bottom:1rem"><strong>Site-linked associates</strong> - linked on the subject's website but handle/name do not match the subject; likely colleagues or collaborators.<table style="margin-top:.65rem;font-size:.82rem;width:100%"><thead><tr><th>Platform</th><th>Handle</th><th>Note</th></tr></thead><tbody>${data.scoredAccounts.filter((s) => s.linkOwnership === "collaborator").map((s) => `<tr><td>${esc(s.platform)}</td><td class="mono"><a href="${esc(s.url)}" target="_blank" rel="noopener">@${esc(s.username)}</a></td><td style="color:var(--muted)">${esc(s.ownershipNote || "associate link")}</td></tr>`).join("")}</tbody></table></div>` : ""}
  ${data.usernameProbes?.filter((p) => p.exists).length ? `<div class="social-grid" style="margin-top:.85rem">${data.usernameProbes.filter((p) => p.exists).map((p) => { const sc = data.scoredAccounts?.find((s) => s.url === p.url); const tier = sc?.tier; const isAssoc = sc?.linkOwnership === "collaborator"; return `<div class="social-item" style="${tier === "quarantined" || isAssoc ? "opacity:.55" : ""}"><div class="plat">${esc(p.platform)}</div><div class="url"><a href="${esc(p.url)}" target="_blank" rel="noopener">@${esc(p.username)}</a></div><p style="font-size:.82rem;color:var(--muted)">${esc(p.displayName || p.bio || "")}</p><span class="badge ${isAssoc ? "warn" : tier === "attributed" ? "ok" : tier === "quarantined" ? "muted" : "warn"}">${isAssoc ? "associate" : sc ? `${(sc.posterior * 100).toFixed(0)}%` : `${p.confidence}%`} · ${esc(p.method)}${tier && !isAssoc ? ` · ${tier}` : ""}</span></div>`; }).join("")}</div>` : ""}
</section>`
    : ""
}

<section id="candidates">
  <h2>Identity Candidates</h2>
  <div class="candidates">
    ${data.disambiguation.candidates
      .map(
        (c) => `<div class="cand">
      <div><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">${esc(cleanTitle(c.label))}</a>
      ${c.snippet ? `<p style="font-size:.8rem;color:var(--muted);margin-top:.25rem">${esc(c.snippet.slice(0, 160))}</p>` : ""}
      ${c.signals.length ? `<p style="font-size:.72rem;color:var(--violet);margin-top:.2rem">${c.signals.map((s) => esc(s)).join(" · ")}</p>` : ""}</div>
      <span class="score-pill">${c.matchScore}</span></div>`,
      )
      .join("")}
  </div>
</section>

<section id="search">
  <h2>Public Search Results</h2>
  <div class="hits">
    ${data.searchHits
      .map((h, i) => {
        const rel = h.relevanceScore ?? 0;
        return `<article class="hit">
      <span class="hit-n">${String(i + 1).padStart(2, "0")}</span>
      <div class="hit-body">
        <h3><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(cleanTitle(h.title))}</a></h3>
        <p class="hit-meta"><span class="badge ${h.classification === "corroborated" ? "ok" : h.classification === "excluded" ? "muted" : "warn"}">${esc(h.classification || "possible")}</span> <span style="color:var(--cyan)">${esc(hostname(h.url))}</span> · query <code>${esc(h.query)}</code>${h.anchorSignals?.length ? ` · ${h.anchorSignals.map((s) => esc(s)).join(", ")}` : ""}</p>
      </div>
      <div><div class="rel-bar"><div class="rel-fill" style="width:${rel}%"></div></div><span style="font-size:.68rem;color:var(--muted)">${rel}%</span></div>
    </article>`;
      })
      .join("")}
  </div>
</section>

${
  data.excludedHits?.length
    ? `<section id="excluded"><h2>Excluded Homonyms</h2><div class="hits">${data.excludedHits.map((h, i) => `<article class="hit" style="opacity:.75"><span class="hit-n">${String(i + 1).padStart(2, "0")}</span><div class="hit-body"><h3><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(cleanTitle(h.title))}</a></h3><p class="hit-meta"><span class="badge muted">excluded</span> ${esc(h.exclusionReason || "homonym")}</p></div></article>`).join("")}</div></section>`
    : ""
}

<section id="social">
  <h2>Social Footprint</h2>
  <div class="social-grid">
    ${data.socialCandidates
      .map(
        (s) => `<div class="social-item">
      <div class="plat">${esc(s.platform)}</div>
      <div class="url"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div>
      <span class="badge ${statusClass(s.status)}">${esc(s.status)}</span>
      <span style="font-size:.75rem;color:var(--muted);margin-left:.35rem">${s.confidence}% · ${esc(s.method)}</span>
    </div>`,
      )
      .join("")}
  </div>
</section>

${
  data.wikipedia?.length || data.wikipediaExcluded?.length
    ? `<section id="wikipedia"><h2>Wikipedia</h2><div class="card">${data.wikipedia?.length ? `<h3 style="font-size:.85rem;color:var(--cyan);margin-bottom:.5rem">Relevant (anchor/topic match)</h3><ul class="clean">${data.wikipedia.map((w) => `<li><a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.title)}</a>${w.description ? ` - ${esc(w.description)}` : ""}${w.relevance ? ` <span style="color:var(--muted);font-size:.78rem">(${esc(w.relevance)})</span>` : ""}</li>`).join("")}</ul>` : `<p style="color:var(--muted);font-size:.85rem">No Wikipedia article matches this subject - existing articles are homonyms.</p>`}${data.wikipediaExcluded?.length ? `<h3 style="font-size:.85rem;color:var(--amber);margin:1rem 0 .5rem">Excluded homonyms</h3><ul class="clean">${data.wikipediaExcluded.map((w) => `<li style="opacity:.75"><a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.title)}</a>${w.description ? ` - ${esc(w.description)}` : ""} <span style="color:var(--muted);font-size:.78rem">(${esc(w.exclusionReason || "homonym")})</span></li>`).join("")}</ul>` : ""}</div></section>`
    : ""
}

${
  data.accountCorrelation?.mutualMetadata.length
    ? `<section id="correlation"><h2>Account Correlation</h2><div class="card">${data.accountCorrelation.displayNameConsensus ? `<p style="margin-bottom:.75rem"><strong style="color:var(--cyan)">Name consensus:</strong> ${esc(data.accountCorrelation.displayNameConsensus)}</p>` : ""}<ul class="clean">${data.accountCorrelation.mutualMetadata.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div></section>`
    : ""
}

${
  data.chainOfCustody
    ? `<section id="custody"><h2>Chain of Custody</h2><div class="card"><dl class="kv"><dt>Manifest hash</dt><dd class="mono" style="word-break:break-all">${esc(data.chainOfCustody.manifestHash)}</dd><dt>Items</dt><dd>${data.chainOfCustody.evidenceCount}</dd><dt>Tool</dt><dd>${esc(data.chainOfCustody.tool)}</dd></dl><p style="margin-top:.75rem;font-size:.78rem;color:var(--muted)">${esc(data.chainOfCustody.algorithm)}</p></div></section>`
    : ""
}

<section id="evidence">
  <h2>Evidence Archive</h2>
  <div class="card" style="padding:0;overflow:hidden">
    <table>
      <thead><tr><th>ID</th><th>Type</th><th>Source</th><th>Captured</th><th>SHA-256</th></tr></thead>
      <tbody>
        ${data.evidence
          .map(
            (e) => `<tr>
          <td class="mono" style="color:var(--muted)">${esc(e.id)}</td>
          <td><span class="type-tag">${esc(e.type)}</span></td>
          <td><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(cleanTitle(e.title))}</a>
          ${e.excerpt && e.type === "page-capture" ? `<div class="capture">${esc(e.excerpt.slice(0, 400))}</div>` : ""}</td>
          <td style="color:var(--muted);font-size:.78rem">${new Date(e.capturedAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
          <td class="hash mono" title="${esc(e.hash)}">${esc(e.hash.slice(0, 16))}...</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>
</section>

<section id="sources">
  <h2>Source Inventory</h2>
  <div class="card">
    ${data.sourceInventory
      .map((cat) => {
        const items = cat.sources.map((s) => {
          const urlMatch = s.match(/https?:\/\/[^\s]+/);
          if (urlMatch) {
            const url = urlMatch[0];
            const label = s.replace(url, "").replace(/:\s*$/, "").trim() || hostname(url);
            return `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(label || url)}</a></li>`;
          }
          return `<li>${esc(s)}</li>`;
        });
        return `<div class="inv-cat"><h4>${esc(cat.category)} (${cat.count})</h4><ul>${items.join("")}</ul></div>`;
      })
      .join("")}
  </div>
</section>

<footer>
  <p>Public sources only · No authenticated scraping · For legitimate research</p>
  <p style="margin-top:.35rem">File: <code class="mono">${esc(fileBasename)}</code> · Manifest SHA-256: <code class="mono">${esc(data.chainOfCustody?.manifestHash?.slice(0, 24) || " - ")}...</code></p>
  <p style="margin-top:.35rem">Generated by <a href="https://github.com/Pitchfork-and-Torch/spectra-desk" target="_blank" rel="noopener">Spectra Desk</a> v${SPECTRA_VERSION} - investigator-grade OSINT</p>
</footer>
</main>
</div>
<script>
(function(){
  const search=document.getElementById('report-search');
  const sections=document.querySelectorAll('main section');
  if(search){search.addEventListener('input',function(){const q=this.value.toLowerCase().trim();sections.forEach(s=>{const t=s.textContent.toLowerCase();s.style.display=!q||t.includes(q)?'':'none';});});}
  const navLinks=document.querySelectorAll('#report-nav a');
  const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){navLinks.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id));}});},{rootMargin:'-20% 0px -60% 0px',threshold:0});
  sections.forEach(s=>obs.observe(s));
})();
</script>
</body>
</html>`;
}