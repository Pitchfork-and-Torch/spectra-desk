import type { OsintReport } from "../types.js";
import { fullName } from "./subject.js";
import { buildReportHtml } from "./report-html.js";
import { buildDossierMarkdown } from "./dossier-html.js";

export function buildReport(data: Omit<OsintReport, "markdown" | "html">): Pick<OsintReport, "executiveSummary" | "sourceInventory" | "markdown" | "html"> {
  const name = fullName(data.subject) || "Subject";
  const socialFound = data.socialCandidates.filter((s) => s.status === "found" || s.status === "verified");
  const socialPossible = data.socialCandidates.filter((s) => s.status === "possible");

  const corroborated = data.searchHits.filter((h) => h.classification === "corroborated").length;
  const excluded = data.excludedHits?.length || 0;
  const probes = data.usernameProbes?.filter((p) => p.exists).length || 0;

  const executiveSummary = [
    `**${name}** - OSINT report generated ${new Date(data.createdAt).toLocaleString()}.`,
    data.investigatorBrief ? `Investigator tier: **${data.investigatorBrief.confidenceTier}**. ${data.investigatorBrief.assessment}` : "",
    `Disambiguation: **${data.disambiguation.score}/100** (${data.disambiguation.homonymRisk} homonym risk) - ${data.disambiguation.label}.`,
    data.disambiguation.refined ? "User refinement applied." : "",
    `**${corroborated}** anchor-corroborated hits, **${excluded}** homonyms excluded, **${probes}** verified username probes.`,
    `Collected **${data.searchHits.length}** retained search hits, **${data.evidence.length}** archived evidence items,`,
    `**${socialFound.length}** confirmed public profiles.`,
    data.githubIntel?.name ? `GitHub registered name: **${data.githubIntel.name}**.` : "",
    data.domainIntel?.siteTitle ? `Domain site: **${data.domainIntel.siteTitle}**.` : "",
    "",
    "_Public sources only. Investigative lead - not legal proof of identity._",
  ]
    .filter(Boolean)
    .join(" ");

  const sourceInventory = [
    {
      category: "Web Search",
      count: data.searchHits.length,
      sources: [
        ...new Set(
          data.searchHits.map((h) => {
            try {
              return new URL(h.url).hostname;
            } catch {
              return h.url;
            }
          }),
        ),
      ].slice(0, 15),
    },
    {
      category: "Social Footprint",
      count: data.socialCandidates.length,
      sources: data.socialCandidates.map((s) => `${s.platform}: ${s.url}`),
    },
    {
      category: "Archived Evidence",
      count: data.evidence.length,
      sources: data.evidence.map((e) => `${e.type} - ${e.title}`),
    },
  ];

  if (data.emailIntel) {
    sourceInventory.push({
      category: "Email Intelligence",
      count: 1 + data.emailIntel.publicMentions.length,
      sources: [data.emailIntel.domain, ...data.emailIntel.publicMentions.map((m) => m.url)],
    });
  }

  const markdown = [
    `# Spectra OSINT Report: ${name}`,
    "",
    `**Report ID:** \`${data.id}\`  `,
    `**Status:** ${data.status}  `,
    `**Disambiguation:** ${data.disambiguation.score}/100 - ${data.disambiguation.label}`,
    "",
    "## Executive Summary",
    "",
    executiveSummary,
    "",
    data.dossier ? buildDossierMarkdown(data.dossier) : "",
    data.portraitIntel?.candidates.length
      ? [
          "## Visual Identity (Portraits)",
          "",
          data.portraitIntel.summary,
          "",
          ...(data.portraitIntel.anchorPortrait
            ? [`**Anchor:** ${data.portraitIntel.anchorPortrait.label} (${data.portraitIntel.anchorPortrait.platform})`, ""]
            : []),
          "### Portrait candidates",
          ...data.portraitIntel.candidates.map(
            (p) =>
              `- **${p.label}** (${p.platform}, ${p.role}) - ${p.matchVerdict}${p.similarityToAnchor != null ? ` · ${(p.similarityToAnchor * 100).toFixed(0)}%` : ""}${p.profileUrl ? ` · [profile](${p.profileUrl})` : ""}`,
          ),
          ...(data.portraitIntel.homonymProfiles.length
            ? [
                "",
                "### Homonym face comparison",
                ...data.portraitIntel.homonymProfiles.map(
                  (h) =>
                    `- ${h.label}: ${h.distinctFromAnchor ? "visually **distinct** from anchor" : h.similarity != null ? `${(h.similarity * 100).toFixed(0)}% similar - manual review` : "inconclusive"}`,
                ),
              ]
            : []),
          "",
        ].join("\n")
      : "",
    "## Disambiguation Analysis",
    "",
    `Homonym risk: **${data.disambiguation.homonymRisk}** | Refined: ${data.disambiguation.refined ? "yes" : "no"}`,
    "",
    ...data.disambiguation.rationale.map((r) => `- ${r}`),
    "",
    data.disambiguation.candidates.length
      ? "### Identity Candidates\n" + data.disambiguation.candidates.map((c) => `- [${c.label}](${c.sourceUrl}) (score ${c.matchScore})`).join("\n")
      : "",
    "",
    "### Distinguishing Signals",
    data.disambiguation.distinguishingSignals.length
      ? data.disambiguation.distinguishingSignals.map((s) => `- ${s}`).join("\n")
      : "_None provided - add email, location, or employer._",
    "",
    data.investigatorBrief
      ? [
          "## Investigator Brief",
          "",
          `**Confidence tier:** ${data.investigatorBrief.confidenceTier}`,
          "",
          data.investigatorBrief.assessment,
          "",
          "### Account → Name Correlation",
          ...data.investigatorBrief.accountToNameLinks.map(
            (l) => `- **${l.platform}** @${l.account} → ${l.linkedName || "unknown"} (${l.confidence}%) [${l.evidence}](${l.evidence})`,
          ),
          "",
          "### Excluded Identities (Homonyms)",
          ...(data.investigatorBrief.excludedIdentities.length
            ? data.investigatorBrief.excludedIdentities.map((e) => `- [${e.label}](${e.sourceUrl}) - _${e.reason}_`)
            : ["_None_"]),
          "",
          "### Anchor Status",
          `- Username: ${data.investigatorBrief.anchorStatus.hasUsername ? "yes" : "no"} | Email: ${data.investigatorBrief.anchorStatus.hasEmail ? "yes" : "no"} | Domain: ${data.investigatorBrief.anchorStatus.hasDomain ? "yes" : "no"}`,
          `- Sufficient for common name: ${data.investigatorBrief.anchorStatus.sufficientForCommonName ? "yes" : "no"}`,
          "",
          "### Recommended Actions",
          ...data.investigatorBrief.recommendedActions.map((a) => `- ${a}`),
          "",
          "### Legal Contacts (Verified Platforms)",
          ...(data.investigatorBrief.legalContacts.length
            ? data.investigatorBrief.legalContacts.map(
                (l) => `- **${l.platform}** - [Law enforcement guide](${l.lawEnforcementUrl}) - ${l.notes}`,
              )
            : ["_None - no verified accounts_"]),
          "",
          `_${data.investigatorBrief.legalDisclaimer}_`,
          "",
        ].join("\n")
      : "",
    data.accountCorrelation?.mutualMetadata.length
      ? [
          "## Account Correlation",
          "",
          ...(data.accountCorrelation.displayNameConsensus
            ? [`**Display name consensus:** ${data.accountCorrelation.displayNameConsensus}`, ""]
            : []),
          ...data.accountCorrelation.mutualMetadata.map((m) => `- ${m}`),
          "",
          ...data.accountCorrelation.sharedSignals.map(
            (s) => `- \`${s.signal}\` - ${s.platforms.join(", ")} (${s.confidence}%)`,
          ),
          "",
        ].join("\n")
      : "",
    data.chainOfCustody
      ? [
          "## Chain of Custody",
          "",
          `- Tool: ${data.chainOfCustody.tool}`,
          `- Evidence items: ${data.chainOfCustody.evidenceCount}`,
          `- Manifest SHA-256: \`${data.chainOfCustody.manifestHash}\``,
          `- Algorithm: ${data.chainOfCustody.algorithm}`,
          "",
          "| ID | Type | Hash | Captured |",
          "|----|------|------|----------|",
          ...data.chainOfCustody.items.map(
            (i) => `| ${i.id} | ${i.type} | \`${i.hash.slice(0, 16)}...\` | ${i.capturedAt} |`,
          ),
          "",
        ].join("\n")
      : "",
    data.githubIntel
      ? [
          "## GitHub Intelligence",
          "",
          `- Login: [${data.githubIntel.login}](${data.githubIntel.url})`,
          `- Registered name: ${data.githubIntel.name || " - "}`,
          `- Bio: ${data.githubIntel.bio || " - "}`,
          `- Blog: ${data.githubIntel.blog || " - "}`,
          `- Location: ${data.githubIntel.location || " - "}`,
          ...(data.githubIntel.repos?.length
            ? ["", "### Public Repositories", ...data.githubIntel.repos.map((r) => `- [${r.name}](${r.url})${r.language ? ` (${r.language})` : ""}${r.description ? ` - ${r.description}` : ""}`)]
            : []),
          "",
        ].join("\n")
      : "",
    data.domainIntel
      ? [
          "## Domain Intelligence",
          "",
          `- Domain: [${data.domainIntel.domain}](${data.domainIntel.url})`,
          `- Site title: ${data.domainIntel.siteTitle || " - "}`,
          `- Description: ${data.domainIntel.siteDescription || " - "}`,
          data.domainIntel.rdap?.registrar ? `- Registrar: ${data.domainIntel.rdap.registrar}` : "",
          data.domainIntel.rdap?.created ? `- Registered: ${data.domainIntel.rdap.created}` : "",
          data.domainIntel.rdap?.expires ? `- Expires: ${data.domainIntel.rdap.expires}` : "",
          data.domainIntel.wayback?.available
            ? `- [Wayback snapshot](${data.domainIntel.wayback.snapshotUrl}) (${data.domainIntel.wayback.timestamp})`
            : "",
          "",
        ].join("\n")
      : "",
    data.emailIntel?.breachIntel
      ? [
          "## Breach Index",
          "",
          data.emailIntel.breachIntel.checked
            ? data.emailIntel.breachIntel.breaches.length
              ? data.emailIntel.breachIntel.breaches.map((b) => `- **${b.name}** (${b.date}) - ${b.dataClasses.join(", ")}`).join("\n")
              : "- No public breaches found"
            : `- ${data.emailIntel.breachIntel.note || "Not checked"}`,
          "",
        ].join("\n")
      : "",
    data.usernameProbes?.filter((p) => p.exists).length
      ? [
          "## Username Correlation (Verified Probes)",
          "",
          ...data.usernameProbes
            .filter((p) => p.exists)
            .map(
              (p) =>
                `- **${p.platform}** [@${p.username}](${p.url}) - ${p.displayName || "no display name"} (${p.confidence}% via ${p.method})`,
            ),
          "",
        ].join("\n")
      : "",
    "## Public Search Results (Corroborated & Possible)",
    "",
    ...data.searchHits.map(
      (h, i) =>
        `${i + 1}. **[${h.title}](${h.url})** [${h.classification || "possible"}]\n - Query: \`${h.query}\` | Relevance: ${h.relevanceScore || 0}%\n - ${h.snippet || "_no snippet_"}${h.anchorSignals?.length ? `\n - Anchors: ${h.anchorSignals.join(", ")}` : ""}`,
    ),
    "",
    data.excludedHits?.length
      ? [
          "## Excluded Hits (Homonyms)",
          "",
          ...data.excludedHits.map(
            (h, i) => `${i + 1}. ~~[${h.title}](${h.url})~~ - _${h.exclusionReason || "excluded"}_`,
          ),
          "",
        ].join("\n")
      : "",
    "## Social Footprint (Public Index Only)",
    "",
    ...data.socialCandidates.map(
      (s) =>
        `- **${s.platform}** [${s.url}](${s.url}) - ${s.status} (${s.confidence}% via ${s.method})`,
    ),
    "",
    data.emailIntel
      ? [
          "## Email Intelligence",
          "",
          `- Email: \`${data.emailIntel.email}\``,
          `- Domain: ${data.emailIntel.domain}`,
          `- MX: ${data.emailIntel.mxRecords?.join(", ") || "unknown"}`,
          `- [Gravatar check](${data.emailIntel.gravatarUrl})`,
          "",
        ].join("\n")
      : "",
    data.addressIntel
      ? [
          "## Address Intelligence",
          "",
          `- Input: ${data.addressIntel.raw}`,
          data.addressIntel.geocoded
            ? `- Geocoded: ${data.addressIntel.geocoded.displayName}`
            : "- Geocoding: unavailable",
          data.addressIntel.mapUrl ? `- [OpenStreetMap](${data.addressIntel.mapUrl})` : "",
          "",
        ].join("\n")
      : "",
    "## Evidence Archive",
    "",
    "| ID | Type | Source | Hash |",
    "|----|------|--------|------|",
    ...data.evidence.map(
      (e) => `| ${e.id} | ${e.type} | [${e.title}](${e.url}) | \`${e.hash.slice(0, 12)}\` |`,
    ),
    "",
    "## Source Inventory",
    "",
    ...sourceInventory.map(
      (cat) => `### ${cat.category} (${cat.count})\n${cat.sources.map((s) => `- ${s}`).join("\n")}`,
    ),
    "",
    "---",
    "_Generated by [Spectra Desk](https://github.com/Pitchfork-and-Torch/spectra-desk) v2.1 - investigator-grade public-source OSINT._",
  ].join("\n");

  const html = buildReportHtml({ ...data, executiveSummary, sourceInventory });

  return { executiveSummary, sourceInventory, markdown, html };
}