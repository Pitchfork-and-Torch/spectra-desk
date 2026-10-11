import type { AccountCorrelation, InvestigatorBrief, OsintReport, UsernameProbe } from "../types.js";
import type { ScoredAccount } from "./account-scoring.js";
import { hasMinimumAnchors } from "./anchors.js";
import { fullName } from "./subject.js";
import { isCommonName } from "./homonym-filter.js";
import { legalContactsForPlatforms } from "./legal-contacts.js";
import { fuseSignals } from "./signal-fusion.js";
import { displayNameMatchesBrand } from "./homonym-exclusions.js";

function dedupePlatforms(probes: UsernameProbe[]): string[] {
  return [...new Set(probes.filter((p) => p.exists).map((p) => p.platform))];
}

export function buildInvestigatorBrief(
  report: OsintReport,
  probes: UsernameProbe[],
  correlation?: AccountCorrelation,
  scored?: ScoredAccount[],
): InvestigatorBrief {
  const name = fullName(report.subject);
  const corroborated = report.searchHits.filter((h) => h.classification === "corroborated");
  const excluded = report.excludedHits || [];
  const anchorHits = corroborated.length;
  const scoredMap = new Map((scored || []).map((s) => [s.url, s]));
  const verifiedAccounts = probes.filter((p) => {
    const s = scoredMap.get(p.url);
    return p.exists && (!s || s.tier !== "quarantined");
  });
  const attributed = (scored || []).filter((s) => s.tier === "attributed");
  const quarantined = (scored || []).filter((s) => s.tier === "quarantined");
  const anchorStatus = hasMinimumAnchors(report.subject);
  const common = isCommonName(report.subject.firstName, report.subject.lastName);

  const apiVerified = verifiedAccounts.filter((p) => (p.method === "api" || p.method === "site-link" || p.method === "platform-resolver") && p.confidence >= 80);
  const effectiveCorroboration =
    anchorHits + (apiVerified.length > 0 ? 1 : 0) + (correlation?.displayNameConsensus ? 1 : 0);

  let confidenceTier: InvestigatorBrief["confidenceTier"] = "insufficient";

  if (
    effectiveCorroboration >= 2 &&
    attributed.length >= 1 &&
    report.disambiguation.score >= 75 &&
    anchorStatus.sufficientForCommonName
  ) {
    confidenceTier = common ? "likely" : "confirmed";
  } else if (
    (effectiveCorroboration >= 1 && apiVerified.length >= 1 && anchorStatus.sufficientForCommonName) ||
    (attributed.length >= 2 && report.githubIntel && anchorStatus.hasDomain)
  ) {
    confidenceTier = "likely";
  } else if (report.disambiguation.score < 50 || (excluded.length >= 4 && effectiveCorroboration < 2)) {
    confidenceTier = "uncertain";
  } else if (verifiedAccounts.length === 0 && anchorHits === 0) {
    confidenceTier = "insufficient";
  } else if (verifiedAccounts.length >= 1) {
    confidenceTier = "likely";
  }

  const verificationWarnings: string[] = [];
  for (const q of quarantined) {
    verificationWarnings.push(
      `${q.platform} @${q.username}: quarantined (posterior ${(q.posterior * 100).toFixed(0)}%) - HTTP-only or no content corroboration`,
    );
  }
  const associates = (scored || []).filter((s) => s.linkOwnership === "collaborator");
  for (const a of associates) {
    verificationWarnings.push(
      `${a.platform} @${a.username}: linked on subject site - treat as colleague/associate, not subject-owned (${a.ownershipNote || "handle mismatch"})`,
    );
  }
  if (common) {
    verificationWarnings.push("Common name - require anchor-backed accounts before formal attribution.");
  }
  if (report.searchHealth?.degraded) {
    verificationWarnings.push(
      `Web search degraded (${report.searchHealth.withHits}/${report.searchHealth.attempted} queries returned hits) - corroboration leans on anchors, APIs, and site crawl.`,
    );
  }

  const accountToNameLinks = verifiedAccounts
    .filter((p, i, arr) => arr.findIndex((x) => x.platform === p.platform && x.username === p.username) === i)
    .filter((p) => {
      const s = scoredMap.get(p.url);
      return s?.tier !== "quarantined" && s?.linkOwnership !== "collaborator";
    })
    .sort((a, b) => {
      const sa = scoredMap.get(a.url);
      const sb = scoredMap.get(b.url);
      const brandA = displayNameMatchesBrand(a.displayName || "", report.subject);
      const brandB = displayNameMatchesBrand(b.displayName || "", report.subject);
      if (brandA !== brandB) return brandA ? -1 : 1;
      return (sb?.posterior || 0) - (sa?.posterior || 0);
    })
    .map((p) => {
      const s = scoredMap.get(p.url);
      return {
        account: p.username,
        platform: p.platform,
        linkedName: p.displayName,
        linkedUrl: p.linkedUrl,
        confidence: s ? Math.round(s.posterior * 100) : p.confidence,
        posterior: s?.posterior,
        tier: s?.tier,
        evidence: p.url,
        method: p.method,
      };
    });

  const excludedIdentities = excluded.map((h) => ({
    label: h.title.slice(0, 100),
    reason: h.exclusionReason || "Homonym - no anchor corroboration",
    sourceUrl: h.url,
  }));

  const corroboratedFacts: string[] = [];
  if (name) corroboratedFacts.push(`Subject name intake: ${name}`);
  if (report.subject.username) corroboratedFacts.push(`Primary username: ${report.subject.username}`);
  if (report.subject.employer) corroboratedFacts.push(`Anchor site/org: ${report.subject.employer}`);
  if (correlation?.displayNameConsensus) {
    corroboratedFacts.push(`Cross-platform display name consensus: ${correlation.displayNameConsensus}`);
  }
  for (const meta of correlation?.mutualMetadata.slice(0, 4) || []) {
    corroboratedFacts.push(meta);
  }
  if (report.githubIntel?.name) corroboratedFacts.push(`GitHub registered name: ${report.githubIntel.name}`);
  if (report.domainIntel?.siteTitle) corroboratedFacts.push(`Domain site title: ${report.domainIntel.siteTitle}`);
  if (report.domainIntel?.rdap?.registrar) corroboratedFacts.push(`Domain registrar: ${report.domainIntel.rdap.registrar}`);
  const fusion = fuseSignals(report.subject, report.searchHits, report.githubIntel, report.domainIntel);
  for (const fact of fusion.fusedFacts.slice(0, 5)) {
    if (!corroboratedFacts.includes(fact)) corroboratedFacts.push(fact);
  }
  if (report.emailIntel?.gravatarExists) corroboratedFacts.push(`Gravatar profile exists for ${report.emailIntel.email}`);
  if (report.emailIntel?.breachIntel?.breaches.length) {
    corroboratedFacts.push(`Email appears in ${report.emailIntel.breachIntel.breaches.length} public breach(es)`);
  }
  if (report.chainOfCustody) {
    corroboratedFacts.push(`Evidence manifest hash: ${report.chainOfCustody.manifestHash.slice(0, 16)}... (${report.chainOfCustody.evidenceCount} items)`);
  }

  const recommendedActions: string[] = [];

  if (common && !anchorStatus.sufficientForCommonName) {
    recommendedActions.push(
      "BLOCKING: Common name without sufficient anchors - obtain username + email or domain before formal attribution.",
    );
  } else if (common) {
    recommendedActions.push("Common name with anchor corroboration - proceed with verified accounts only; ignore excluded homonyms.");
  }

  if (!report.subject.email) {
    recommendedActions.push("Obtain subject email for Gravatar, breach-index (HIBP), and account recovery correlation.");
  } else if (!report.emailIntel?.breachIntel?.checked) {
    recommendedActions.push("Set HIBP_API_KEY to enable Have I Been Pwned breach correlation for the provided email.");
  }

  if (correlation && correlation.mutualMetadata.length > 0) {
    recommendedActions.push("Cross-account signals detected - see Account Correlation section for shared domains, names, and locations.");
  } else if (verifiedAccounts.length > 0) {
    const platforms = dedupePlatforms(probes);
    recommendedActions.push(
      `Cross-reference ${platforms.length} verified platform(s) (${platforms.join(", ")}) for mutual connections and shared metadata.`,
    );
  }

  if (report.domainIntel) {
    const d = report.domainIntel;
    if (d.wayback?.available) {
      recommendedActions.push(`Review Wayback snapshot (${d.wayback.timestamp}) for historical ownership/content signals.`);
    }
    if (d.rdap) {
      recommendedActions.push(
        `RDAP: registrar ${d.rdap.registrar || "unknown"}, created ${d.rdap.created || "unknown"}${d.rdap.registrantCountry ? `, registrant country ${d.rdap.registrantCountry}` : ""}.`,
      );
    }
  }

  if (verifiedAccounts.length > 0) {
    recommendedActions.push("Issue preservation letters / subpoenas to platforms listed in Legal Contacts - reference account URLs and evidence hashes.");
  }

  if (report.chainOfCustody) {
    recommendedActions.push(
      `Preserve MANIFEST.json and per-item evidence JSON; manifest SHA-256: ${report.chainOfCustody.manifestHash}`,
    );
  }

  const legalContacts = legalContactsForPlatforms(dedupePlatforms(probes));

  let assessment = "";
  if (confidenceTier === "confirmed") {
    assessment = `Anchor-corroborated sources and cross-platform metadata support attributing verified handles to ${name || "the subject"}.`;
  } else if (confidenceTier === "likely") {
    assessment = `Partial corroboration with ${anchorHits} anchor-linked hits and ${verifiedAccounts.length} verified accounts. Verify before formal attribution.`;
  } else if (confidenceTier === "uncertain") {
    assessment = `Homonym contamination (${excluded.length} excluded). Do not attribute without additional anchors.`;
  } else {
    assessment = `Insufficient corroboration. Expand intake (email, username, domain) and re-run.`;
  }

  return {
    assessment,
    confidenceTier,
    verificationWarnings,
    anchorStatus,
    accountToNameLinks,
    excludedIdentities,
    corroboratedFacts,
    recommendedActions,
    legalContacts,
    legalDisclaimer:
      "Spectra Desk uses publicly indexable sources only. This brief supports investigative leads - not legal proof of identity. Confirm findings through authorized law enforcement channels, subpoenas, and direct verification.",
  };
}