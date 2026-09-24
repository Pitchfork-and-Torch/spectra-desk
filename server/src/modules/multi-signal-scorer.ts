/**
 * Multi-signal disambiguation + identity lock (v6)
 * Aligns numeric score with investigator tier - prevents "94 + insufficient" without content/faces.
 */
import type { SearchHit, SubjectInput, UsernameProbe } from "../types.js";
import { isCommonName } from "./homonym-filter.js";
import { nameMatchesInText } from "./name-variants.js";
import { locationLine } from "./subject.js";
import type { DeepProfile } from "./deep-profile.js";
import { deepProfileHasContent } from "./deep-profile.js";
import { assessPortraitUrlQuality } from "./portrait-quality.js";
import type { PortraitCandidate } from "../types.js";

export type IdentityLockStatus = "locked" | "probable" | "possible" | "insufficient";

export interface MultiSignalInput {
  subject: SubjectInput;
  hits: SearchHit[];
  excludedCount: number;
  probes: UsernameProbe[];
  deepProfiles?: DeepProfile[];
  portraits?: PortraitCandidate[];
  hasLinkedInPivot?: boolean;
  hasReferencePhoto?: boolean;
  faceMatchCount?: number;
  operatorConfirmed?: boolean;
  /** v8: business entity fusion score 0 - 100 */
  businessFusionScore?: number;
  businessStrength?: "locked" | "attributed" | "likely" | "possible" | "weak";
  /** v8: life-stage continuity 0 - 100 */
  continuityScore?: number;
  /** v8: official-record style hits (sunbiz, arrest, bbb) */
  officialRecordCount?: number;
  /** v8: attributed accounts only (not HTTP probes) */
  attributedAccountCount?: number;
  /** v8: semantic corpus content points */
  semanticContentBoost?: number;
}

export interface IdentityLockResult {
  status: IdentityLockStatus;
  score: number;
  structuralScore: number;
  contentScore: number;
  visualScore: number;
  /** v8 component breakdown */
  officialRecordScore?: number;
  continuityScore?: number;
  businessScore?: number;
  signalClasses: string[];
  contradictions: string[];
  nextActions: string[];
  rationale: string[];
  scoreCapApplied?: number;
  lockedAt?: string;
  lockedBy?: "auto" | "operator";
}

function nameRarityBonus(last?: string): number {
  if (!last) return 0;
  if (isCommonName("x", last)) return 0;
  if (last.length >= 8) return 12;
  if (last.length >= 5) return 8;
  return 4;
}

export function scoreMultiSignal(input: MultiSignalInput): IdentityLockResult {
  const { subject } = input;
  const signals: string[] = [];
  const contradictions: string[] = [];
  const rationale: string[] = [];
  const nextActions: string[] = [];

  let structural = 0;
  let content = 0;
  let visual = 0;

  // --- Structural ---
  if (subject.firstName && subject.lastName) {
    structural += 8;
    signals.push("full-name");
  }
  structural += nameRarityBonus(subject.lastName);
  if (subject.lastName && !isCommonName(subject.firstName, subject.lastName)) {
    signals.push("uncommon-surname");
    rationale.push("Uncommon surname reduces pure name-collision risk");
  }
  const loc = locationLine(subject);
  if (loc) {
    structural += 10;
    signals.push("intake-location");
  }
  if (subject.email) {
    structural += 14;
    signals.push("email-anchor");
  }
  if (subject.username) {
    structural += 10;
    signals.push("username-anchor");
  }
  if (subject.employer) {
    structural += 8;
    signals.push("employer-anchor");
  }
  if (input.hasLinkedInPivot) {
    structural += 6;
    signals.push("linkedin-pivot");
    rationale.push("LinkedIn directory pivot present (not a verified /in/ profile)");
  }
  if (input.excludedCount >= 2) {
    structural += 6;
    signals.push("noise-filtered");
  }

  // Location in corpus
  const locHits = input.hits.filter((h) => {
    const blob = `${h.title} ${h.snippet}`.toLowerCase();
    return (
      (subject.city && blob.includes(subject.city.toLowerCase())) ||
      (subject.state && blob.includes(subject.state.toLowerCase()))
    );
  });
  if (locHits.length) {
    structural += Math.min(12, 4 + locHits.length * 2);
    signals.push("location-corpus");
  }

  // Full-name media / records
  const nameHits = input.hits.filter(
    (h) =>
      h.classification !== "excluded" &&
      nameMatchesInText(subject.firstName, subject.lastName, `${h.title} ${h.snippet}`) >= 0.85,
  );
  if (nameHits.length) {
    content += Math.min(12, nameHits.length * 4);
    signals.push("full-name-media");
    rationale.push(`${nameHits.length} full-name public hit(s) in search corpus`);
  }

  // --- Content (deep profiles) ---
  const deep = input.deepProfiles || [];
  const rich = deep.filter((p) => p.exists && deepProfileHasContent(p));
  const locationMatchProfiles = rich.filter(
    (p) =>
      p.locationText &&
      ((subject.city && p.locationText.toLowerCase().includes(subject.city.toLowerCase())) ||
        (subject.state && p.locationText.toLowerCase().includes(subject.state.toLowerCase()))),
  );
  const nameMatchProfiles = rich.filter(
    (p) => nameMatchesInText(subject.firstName, subject.lastName, `${p.displayName || ""} ${p.bio || ""}`) >= 0.7,
  );

  content += Math.min(24, rich.length * 8);
  if (rich.length) {
    signals.push("content-profile");
    rationale.push(`${rich.length} profile(s) with extractable public content`);
  }
  if (locationMatchProfiles.length) {
    content += 12;
    signals.push("profile-location");
  }
  if (nameMatchProfiles.length) {
    content += 10;
    signals.push("profile-displayname");
  }

  // Existence-only probes do NOT add content points
  const existsOnly = input.probes.filter((p) => p.exists && p.method === "http-probe").length;
  if (existsOnly >= 5 && rich.length === 0) {
    rationale.push(
      `${existsOnly} HTTP existence probes without profile content - not counted as attribution`,
    );
    nextActions.push("Enrich live profiles (deep extract) or supply known username with public bio");
  }

  // --- Visual ---
  const portraits = input.portraits || [];
  const quality = portraits.map((p) => ({
    p,
    q: assessPortraitUrlQuality(p.imageUrl, { label: p.label, platform: p.platform, profileUrl: p.profileUrl }),
  }));
  const faceLike = quality.filter((x) => x.q.isLikelyFace && !x.q.isPlatformLogo);
  const logos = quality.filter((x) => x.q.isPlatformLogo);

  if (logos.length && faceLike.length === 0) {
    rationale.push(`${logos.length} portrait(s) rejected as platform logos/brand assets`);
    nextActions.push("Supply a reference photo or locate a real profile avatar (not platform logos)");
  }
  if (faceLike.length) {
    visual += Math.min(20, faceLike.length * 8);
    signals.push("face-candidate");
  }
  if (input.hasReferencePhoto) {
    visual += 8;
    signals.push("reference-photo");
  }
  if ((input.faceMatchCount || 0) >= 1) {
    visual += 15;
    signals.push("face-cluster");
    rationale.push("Face similarity match against anchor/reference");
  }

  // Employment public
  if (
    subject.employer &&
    input.hits.some((h) => `${h.title} ${h.snippet}`.toLowerCase().includes(subject.employer!.toLowerCase()))
  ) {
    content += 12;
    signals.push("employer-corpus");
  }

  // --- v8 Official records (Sunbiz, BBB, arrest, courts) - dominate over probe counts ---
  let officialRecordScore = 0;
  const officialHits = input.hits.filter((h) => {
    const blob = `${h.title} ${h.snippet} ${h.url}`.toLowerCase();
    return (
      /sunbiz|dos\.myflorida|bbb\.org|mugshot|arrest|booking|courtlistener|registered agent|bioscenecare/.test(
        blob,
      ) && nameMatchesInText(subject.firstName, subject.lastName, `${h.title} ${h.snippet}`) >= 0.7
    );
  });
  const officialCount = Math.max(input.officialRecordCount || 0, officialHits.length);
  if (officialCount >= 1) {
    officialRecordScore += Math.min(28, 12 + officialCount * 6);
    signals.push("official-record");
    rationale.push(
      `${officialCount} official-record / business-registry / public-booking hit(s) with name match - high-weight anchors`,
    );
  }

  // --- v8 Business entity fusion ---
  let businessScore = 0;
  if ((input.businessFusionScore || 0) > 0) {
    businessScore = Math.min(30, Math.round((input.businessFusionScore || 0) * 0.9));
    signals.push("business-entity");
    rationale.push(
      `Business entity fusion ${input.businessStrength || "scored"} (+${businessScore}) - owner/principal multi-signal link`,
    );
  }

  // --- v8 Life-stage continuity (MMA → Navy → sales → Tampa business) is positive ---
  let continuityComponent = 0;
  if ((input.continuityScore || 0) >= 20) {
    continuityComponent = Math.min(18, Math.round((input.continuityScore || 0) * 0.35));
    signals.push("life-continuity");
    rationale.push(
      `Multi-stage life continuity ${input.continuityScore}/100 - distant records can corroborate one uncommon-name persona`,
    );
  }

  if ((input.semanticContentBoost || 0) > 0) {
    content += Math.min(16, input.semanticContentBoost || 0);
    signals.push("semantic-content");
  }

  // Attributed accounts (not HTTP-only) - small content boost; never flood from probe count
  if ((input.attributedAccountCount || 0) >= 1) {
    content += Math.min(10, (input.attributedAccountCount || 0) * 5);
    signals.push("attributed-account");
  }

  // Do NOT reward raw verified probe counts (v7 failure mode)
  const probeExists = input.probes.filter((p) => p.exists).length;
  if (probeExists >= 10 && rich.length === 0 && (input.attributedAccountCount || 0) === 0) {
    rationale.push(
      `${probeExists} username existence probes ignored for scoring - existence ≠ attribution`,
    );
  }

  let raw =
    structural + content + visual + officialRecordScore + businessScore + continuityComponent;
  // Cap when no content, no faces, no official records, no business - structural-only ceiling
  let scoreCapApplied: number | undefined;
  const hasHardContent =
    content >= 8 || visual >= 8 || officialRecordScore >= 12 || businessScore >= 12;
  if (!hasHardContent) {
    scoreCapApplied = 58;
    if (raw > scoreCapApplied) {
      rationale.push(
        `Structural score ${raw} capped at ${scoreCapApplied} - no content, faces, official records, or business fusion`,
      );
      raw = scoreCapApplied;
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(raw)));

  // Status gate
  let status: IdentityLockStatus = "insufficient";
  const hasFace = signals.includes("face-cluster") || (faceLike.length >= 1 && input.hasReferencePhoto);
  const hasContentAttribution = rich.length >= 1 && (nameMatchProfiles.length >= 1 || locationMatchProfiles.length >= 1);
  const multiContent = rich.length >= 2;
  const hasBusiness =
    (input.businessStrength === "attributed" ||
      input.businessStrength === "likely" ||
      input.businessStrength === "locked") &&
    businessScore >= 12;
  const hasOfficial = officialRecordScore >= 12;

  // LOCKED is a human action. High fusion may reach probable. It never auto-LOCKs.
  const strongBusiness =
    input.businessStrength === "attributed" ||
    input.businessStrength === "likely" ||
    input.businessStrength === "locked";
  const multiClass =
    (hasOfficial ? 1 : 0) +
    (strongBusiness ? 1 : 0) +
    (hasFace ? 1 : 0) +
    (hasContentAttribution || multiContent ? 1 : 0);

  if (input.operatorConfirmed && (hasContentAttribution || hasFace || hasBusiness || hasOfficial || score >= 50)) {
    status = "locked";
  } else if (score >= 85 && multiClass >= 3 && contradictions.length === 0 && strongBusiness) {
    status = "probable";
    rationale.push("High fusion is not LOCKED. You confirm LOCKED. The machine does not.");
  } else if (
    score >= 62 &&
    (hasContentAttribution || hasFace || hasBusiness || hasOfficial || nameHits.length >= 2)
  ) {
    status = "probable";
  } else if (score >= 40 || nameHits.length >= 1 || input.hasLinkedInPivot || hasBusiness) {
    status = "possible";
  } else {
    status = "insufficient";
  }

  // Final rail: no operator confirm, no LOCKED. Face clusters do not lock a brief.
  if (status === "locked" && !input.operatorConfirmed) {
    status = "probable";
    rationale.push("Downgraded LOCKED to PROBABLE. The machine does not LOCK.");
  }

  // Force insufficient/possible when only structural
  if (!hasHardContent && !input.operatorConfirmed) {
    if (status === "locked" || status === "probable") {
      status = "possible";
      rationale.push("Downgraded lock/probable - missing independent content, visual, business, or official-record signals");
    }
    if (score < 45) status = "insufficient";
  }

  // Auto-probable when strong business + location + official records even without social
  if (
    !input.operatorConfirmed &&
    hasBusiness &&
    hasOfficial &&
    signals.includes("location-corpus") &&
    score >= 70 &&
    status === "possible"
  ) {
    status = "probable";
    rationale.push("Upgraded to probable - business entity + official records + location fusion");
  }

  if (!subject.email) nextActions.push("Obtain subject email for Gravatar / breach-index / registration pivots");
  if (!subject.username && rich.length === 0) nextActions.push("Add a known username/handle from LE or open-source tip");
  if (!input.hasReferencePhoto) nextActions.push("Upload a reference photo to enable visual identity locking");
  if (input.hasLinkedInPivot) nextActions.push("Manually open LinkedIn directory pivot and confirm /in/ profile if visible");
  if (nameHits.length) nextActions.push("Review full-name news/public-record hits for employment and associates");
  if (hasBusiness) nextActions.push("Confirm TARGET in Identity Workbench to LOCK business-linked persona");
  if (signals.includes("life-continuity")) {
    nextActions.push("Review life-timeline stages (sports/military/business) as one cluster unless contradictions appear");
  }

  const uniqueActions = [...new Set(nextActions)].slice(0, 8);

  return {
    status,
    score,
    structuralScore: Math.round(structural),
    contentScore: Math.round(content),
    visualScore: Math.round(visual),
    officialRecordScore: Math.round(officialRecordScore),
    continuityScore: Math.round(continuityComponent),
    businessScore: Math.round(businessScore),
    signalClasses: [...new Set(signals)],
    contradictions,
    nextActions: uniqueActions,
    rationale,
    scoreCapApplied,
    lockedAt: status === "locked" ? new Date().toISOString() : undefined,
    lockedBy: status === "locked" ? "operator" : undefined,
  };
}

/** Map lock status to investigator brief / dossier confidence tier. */
export function lockStatusToTier(
  status: IdentityLockStatus,
): "confirmed" | "likely" | "uncertain" | "insufficient" {
  switch (status) {
    case "locked":
      return "confirmed";
    case "probable":
      return "likely";
    case "possible":
      return "uncertain";
    default:
      return "insufficient";
  }
}
