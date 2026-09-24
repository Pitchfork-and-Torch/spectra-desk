import type { SubjectInput, UsernameProbe } from "../types.js";
import { nameMatchesInText } from "./name-variants.js";
import { fullName, locationLine } from "./subject.js";
import { assessLinkOwnership, handleMatchesSubject, type LinkOwnership } from "./link-ownership.js";
import type { ExtractedLink } from "./website-profiler.js";
import {
  builtinWrongIdentities,
  displayNameMatchesBrand,
  hasBrandAnchor,
  isGenericXHomonymHandle,
} from "./homonym-exclusions.js";
import type { PortraitMatchVerdict } from "./image-phash.js";
import { githubProbeMatchesSubject } from "./platform-scoring.js";

export interface EvidenceDelta {
  id: string;
  label: string;
  logOdds: number;
}

export interface ScoredAccount {
  platform: string;
  username: string;
  url: string;
  posterior: number;
  tier: "attributed" | "discovered" | "quarantined";
  evidence: EvidenceDelta[];
  method: string;
  displayName?: string;
  contentSimilarity?: number;
  portraitSimilarity?: number;
  portraitVerdict?: PortraitMatchVerdict;
  linkOwnership?: LinkOwnership;
  ownershipNote?: string;
}

function sigmoid(logOdds: number): number {
  return 1 / (1 + Math.exp(-logOdds));
}

export function scoreAccount(
  probe: UsernameProbe,
  subject: SubjectInput,
  opts: {
    siteLinks?: ExtractedLink[];
    contentSimilarity?: number;
    promoteHttpProbe?: boolean;
    anchorDomain?: string;
    sameAsUrls?: Set<string>;
    portraitSimilarity?: number;
    portraitVerdict?: PortraitMatchVerdict;
  } = {},
): ScoredAccount {
  const evidence: EvidenceDelta[] = [];
  const name = fullName(subject);

  const probeUrl = probe.url.split("#")[0].toLowerCase();
  const builtinWrong = builtinWrongIdentities(subject).find((w) => probeUrl === w.url.toLowerCase());
  if (builtinWrong) {
    evidence.push({ id: "analyst-excluded", label: builtinWrong.reason, logOdds: -3.5 });
  }

  if (probe.platform === "Twitter/X" && hasBrandAnchor(subject) && isGenericXHomonymHandle(probe.username, subject)) {
    evidence.push({ id: "x-generic-homonym", label: "Generic X handle excluded for brand-anchored subject", logOdds: -3.0 });
  }

  const siteLink = opts.siteLinks?.find(
    (l) => l.url === probe.url || l.url.includes(probe.username) || (l.handle && probe.username.includes(l.handle)),
  );
  const ownership = siteLink
    ? assessLinkOwnership(siteLink, subject, opts.sameAsUrls)
    : probe.bio?.includes("associate/colleague")
      ? {
          ownership: "collaborator" as const,
          handleMatchesSubject: false,
          nameMatchScore: 0,
          rationale: probe.bio,
        }
      : null;

  if (ownership?.ownership === "collaborator") {
    evidence.push({
      id: "collaborator-link",
      label: "Linked on site as associate/colleague (not self-claimed)",
      logOdds: -1.8,
    });
    evidence.push({
      id: "handle-mismatch",
      label: ownership.rationale,
      logOdds: -1.2,
    });
  } else if (
    (probe.method === "api" || probe.method === "platform-resolver") &&
    probe.confidence >= 70
  ) {
    evidence.push({
      id: "api-verified",
      label: `${probe.method} profile`,
      logOdds: probe.method === "platform-resolver" ? 2.4 : 2.0,
    });
  } else if (probe.method === "site-link" && probe.confidence >= 70) {
    evidence.push({ id: "site-link", label: "Discovered via owned-site link", logOdds: 1.2 });
  }

  if (probe.linkedUrl && opts.anchorDomain && probe.linkedUrl.includes(opts.anchorDomain)) {
    evidence.push({ id: "blog-anchor", label: "Profile links anchor domain", logOdds: 2.2 });
  }

  if (siteLink && ownership?.ownership === "self-claimed") {
    evidence.push({
      id: "self-claimed",
      label: `Self-claimed on owned site (${siteLink.source})`,
      logOdds: 2.8,
    });
  } else if (siteLink && ownership?.ownership === "site-linked" && ownership.handleMatchesSubject) {
    evidence.push({
      id: "site-nav",
      label: `Site navigation link (${siteLink.source}) with matching handle`,
      logOdds: 1.6,
    });
  } else if (siteLink && ownership?.ownership === "site-linked") {
    evidence.push({
      id: "site-linked-weak",
      label: `Site link without strong self-claim (${siteLink.source})`,
      logOdds: 0.4,
    });
  }

  const brandDisplay = displayNameMatchesBrand(probe.displayName || "", subject);

  if (brandDisplay && probe.platform === "Twitter/X") {
    evidence.push({ id: "brand-match-x", label: "X display name matches subject brand/username anchor", logOdds: 2.6 });
  } else if (probe.displayName && name && nameMatchesInText(subject.firstName, subject.lastName, probe.displayName)) {
    evidence.push({ id: "name-match", label: "Display name matches subject", logOdds: 1.5 });
    if (
      probe.platform === "Twitter/X" &&
      !handleMatchesSubject(probe.username, subject) &&
      !brandDisplay &&
      subject.firstName &&
      subject.lastName
    ) {
      evidence.push({
        id: "x-homonym",
        label: "Common-name X handle without brand/username anchor - possible homonym",
        logOdds: -2.2,
      });
    }
  } else if (probe.displayName && probe.method === "platform-resolver" && brandDisplay) {
    evidence.push({ id: "brand-match", label: "Display name matches subject brand/username", logOdds: 1.8 });
  }

  if (opts.contentSimilarity != null && opts.contentSimilarity >= 0.55) {
    evidence.push({
      id: "content-sim",
      label: `Content similarity ${(opts.contentSimilarity * 100).toFixed(0)}%`,
      logOdds: 1.2 + opts.contentSimilarity,
    });
  }

  if (opts.portraitSimilarity != null && opts.portraitVerdict === "matches-anchor") {
    evidence.push({
      id: "portrait-match",
      label: `Portrait matches anchor (${(opts.portraitSimilarity * 100).toFixed(0)}% visual similarity)`,
      logOdds: 2.0 + opts.portraitSimilarity,
    });
  } else if (opts.portraitSimilarity != null && opts.portraitVerdict === "likely-same") {
    evidence.push({
      id: "portrait-likely",
      label: `Portrait likely same person (${(opts.portraitSimilarity * 100).toFixed(0)}%)`,
      logOdds: 1.0 + opts.portraitSimilarity * 0.8,
    });
  } else if (opts.portraitVerdict === "distinct-person") {
    evidence.push({
      id: "portrait-distinct",
      label: `Portrait visually distinct from anchor (${opts.portraitSimilarity != null ? `${(opts.portraitSimilarity * 100).toFixed(0)}%` : "homonym"})`,
      logOdds: -2.5,
    });
  }

  if (probe.platform === "GitHub" && probe.exists && !githubProbeMatchesSubject(probe, subject)) {
    evidence.push({
      id: "github-homonym",
      label: `GitHub @${probe.username} exists but display name/location do not match subject`,
      logOdds: -2.8,
    });
  }

  if (probe.platform === "LinkedIn" && /linkedin\.com\/in\//i.test(probe.url)) {
    evidence.push({ id: "linkedin-profile", label: "LinkedIn profile URL", logOdds: 2.0 });
    if (probe.location && locationLine(subject) && probe.location.toLowerCase().includes((subject.city || "").toLowerCase())) {
      evidence.push({ id: "linkedin-location", label: `LinkedIn location matches intake (${locationLine(subject)})`, logOdds: 2.4 });
    }
  }

  if (probe.method === "http-probe") {
    evidence.push({ id: "http-only", label: "HTTP existence only", logOdds: -1.5 });
    if (!probe.displayName) {
      evidence.push({ id: "no-display", label: "No display name extracted", logOdds: -0.8 });
    }
  }

  if (probe.method === "platform-resolver" && probe.platform === "Twitter/X") {
    evidence.push({ id: "x-resolve", label: "X profile resolved from public metadata", logOdds: 1.5 });
  }

  const handleOk = handleMatchesSubject(probe.username, subject);
  if (siteLink && !handleOk && ownership?.ownership !== "self-claimed") {
    evidence.push({ id: "handle-not-subject", label: "Handle does not match subject name/username variants", logOdds: -1.5 });
  }

  const logOdds = evidence.reduce((s, e) => s + e.logOdds, 0);
  let posterior = sigmoid(logOdds);

  let tier: ScoredAccount["tier"] = "quarantined";
  const isCollaborator = ownership?.ownership === "collaborator";

  if (!isCollaborator && (posterior >= 0.7 || (probe.method === "api" && probe.confidence >= 85))) {
    tier = "attributed";
  } else if (!isCollaborator && (posterior >= 0.4 || opts.promoteHttpProbe)) {
    tier = "discovered";
  }

  if (isCollaborator) {
    tier = posterior >= 0.25 ? "discovered" : "quarantined";
    posterior = Math.min(posterior, 0.45);
  }

  if (builtinWrong || (probe.platform === "Twitter/X" && hasBrandAnchor(subject) && isGenericXHomonymHandle(probe.username, subject))) {
    tier = "quarantined";
    posterior = Math.min(posterior, 0.08);
  }

  if (probe.method === "http-probe" && !opts.promoteHttpProbe && posterior < 0.5 && !siteLink) {
    tier = "quarantined";
  }

  if (siteLink && !handleOk && ownership?.ownership !== "self-claimed" && tier === "attributed") {
    tier = "discovered";
    posterior = Math.min(posterior, 0.65);
  }

  return {
    platform: probe.platform,
    username: probe.username,
    url: probe.url,
    posterior,
    tier,
    evidence,
    method: probe.method,
    displayName: probe.displayName,
    contentSimilarity: opts.contentSimilarity,
    portraitSimilarity: opts.portraitSimilarity,
    portraitVerdict: opts.portraitVerdict,
    linkOwnership: ownership?.ownership,
    ownershipNote: ownership?.rationale,
  };
}

export function scoreAllAccounts(
  probes: UsernameProbe[],
  subject: SubjectInput,
  opts: Parameters<typeof scoreAccount>[2] = {},
): ScoredAccount[] {
  return probes
    .filter((p) => p.exists)
    .map((p) => scoreAccount(p, subject, opts))
    .sort((a, b) => b.posterior - a.posterior);
}