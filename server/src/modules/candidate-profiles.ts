import type {
  CandidateProfile,
  CandidateProfileAccount,
  CandidateProfileMedia,
  IdentityWorkbench,
  OsintReport,
  PortraitCandidate,
  ScoredAccountSummary,
  SearchHit,
  SubjectInput,
  UsernameProbe,
} from "../types.js";
import { isCommonName } from "./homonym-filter.js";
import { githubProbeMatchesSubject, isLinkedInProfileUrl } from "./platform-scoring.js";
import { nameMatchesInText, nameVariants } from "./name-variants.js";
import { fullName, locationLine } from "./subject.js";

const NEWS_DOMAINS =
  /(?:reuters|bbc\.co|nytimes|washingtonpost|theguardian|apnews|cnn\.com|npr\.org|bloomberg|forbes|techcrunch|arstechnica|wired\.com|politico|nbcnews|cbsnews|abcnews|latimes|usatoday|huffpost|medium\.com\/@)/i;

const OBITUARY_PATTERNS = /findagrave|legacy\.com\/obituaries|obituar|memorial|passed away|died in \d{4}/i;
const AKA_PATTERN = /(?:aka|a\.k\.a\.|also known as|né|née)\s+([A-Za-z][A-Za-z\s.'-]{1,40})/gi;
const LOCATION_PATTERN =
  /\b(?:in|from|based in|lives in|located in|resident of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}(?:,\s*[A-Z]{2})?)/g;
const EMPLOYMENT_PATTERN =
  /\b(?:at|with|for)\s+([A-Z][A-Za-z0-9&.'\s-]{2,40}(?:Inc\.?|LLC|Corp\.?|Ltd\.?|University|College)?)/g;
const YEAR_PATTERN = /\b(19|20)\d{2}\b/g;

interface ProfileDraft {
  id: string;
  displayName: string;
  seedUrl: string;
  seedSnippet: string;
  baseScore: number;
  hitUrls: Set<string>;
  accountUrls: Set<string>;
  portraitIds: Set<string>;
  aliases: Set<string>;
  locations: Set<string>;
  employment: Set<string>;
  associates: Set<string>;
  timeline: CandidateProfile["timeline"];
  media: CandidateProfileMedia[];
  reasoning: string[];
  edgeFlags: Set<string>;
}

function normalizeUrl(url: string): string {
  return url.split("#")[0].replace(/\/$/, "");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractAliases(text: string, subject: SubjectInput): string[] {
  const found = new Set<string>();
  const canonical = fullName(subject);
  if (canonical) found.add(canonical);
  for (const v of nameVariants(subject.firstName)) {
    if (subject.lastName) found.add(`${v.charAt(0).toUpperCase()}${v.slice(1)} ${subject.lastName}`);
  }
  let m: RegExpExecArray | null;
  const re = new RegExp(AKA_PATTERN.source, AKA_PATTERN.flags);
  while ((m = re.exec(text)) !== null) {
    const alias = m[1]?.trim();
    if (alias && alias.length > 3) found.add(alias);
  }
  return [...found].slice(0, 8);
}

function extractLocations(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(LOCATION_PATTERN.source, LOCATION_PATTERN.flags);
  while ((m = re.exec(text)) !== null) {
    const loc = m[1]?.trim();
    if (loc && loc.length > 2 && loc.length < 60) out.add(loc);
  }
  return [...out].slice(0, 5);
}

function extractEmployment(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(EMPLOYMENT_PATTERN.source, EMPLOYMENT_PATTERN.flags);
  while ((m = re.exec(text)) !== null) {
    const emp = m[1]?.trim();
    if (emp && emp.length > 2 && emp.length < 50) out.add(emp);
  }
  return [...out].slice(0, 4);
}

function extractYears(text: string): string[] {
  return [...new Set((text.match(YEAR_PATTERN) || []).slice(0, 6))];
}

function isNewsHit(hit: SearchHit): boolean {
  return NEWS_DOMAINS.test(hit.url) || NEWS_DOMAINS.test(hit.title);
}

function textOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

function accountMatchesSeed(
  probe: UsernameProbe,
  scored: ScoredAccountSummary | undefined,
  seed: ProfileDraft,
  subject: SubjectInput,
): boolean {
  const blob = `${probe.displayName || ""} ${probe.bio || ""} ${probe.location || ""}`.toLowerCase();
  const seedBlob = `${seed.displayName} ${seed.seedSnippet}`.toLowerCase();

  if (probe.linkedUrl && seed.hitUrls.has(normalizeUrl(probe.linkedUrl))) return true;
  if (seed.hitUrls.has(normalizeUrl(probe.url))) return true;

  const locOverlap = [...seed.locations].some((l) => blob.includes(l.toLowerCase()));
  const empOverlap = [...seed.employment].some((e) => blob.includes(e.toLowerCase()));
  if (locOverlap || empOverlap) return true;

  if (probe.displayName && nameMatchesInText(subject.firstName, subject.lastName, probe.displayName) >= 0.85) {
    if (textOverlap(blob, seedBlob) >= 0.15) return true;
  }

  if (scored && scored.posterior >= 0.55 && scored.tier !== "quarantined") {
    if (scored.linkOwnership === "self-claimed" || scored.linkOwnership === "site-linked") return true;
  }

  return false;
}

function portraitMatchesSeed(portrait: PortraitCandidate, seed: ProfileDraft): boolean {
  if (portrait.profileUrl && seed.hitUrls.has(normalizeUrl(portrait.profileUrl))) return true;
  if (portrait.profileUrl && [...seed.accountUrls].some((u) => normalizeUrl(u) === normalizeUrl(portrait.profileUrl!)))
    return true;
  const blob = portrait.label.toLowerCase();
  return [...seed.locations, ...seed.employment].some((s) => blob.includes(s.toLowerCase()));
}

function hitRelatesToSeed(hit: SearchHit, seed: ProfileDraft, subject: SubjectInput): boolean {
  const key = normalizeUrl(hit.url);
  if (seed.hitUrls.has(key)) return true;
  const blob = `${hit.title} ${hit.snippet}`;
  if (nameMatchesInText(subject.firstName, subject.lastName, blob) < 0.5) return false;
  const seedBlob = `${seed.displayName} ${seed.seedSnippet}`;
  if (textOverlap(blob, seedBlob) >= 0.2) return true;
  const hitLocs = extractLocations(blob);
  if (hitLocs.some((l) => [...seed.locations].some((s) => s.toLowerCase() === l.toLowerCase()))) return true;
  return false;
}

function seedFromIdentityCandidate(
  c: { id: string; label: string; sourceUrl: string; snippet: string; matchScore: number },
  subject: SubjectInput,
): ProfileDraft {
  const blob = `${c.label} ${c.snippet}`;
  return {
    id: c.id,
    displayName: c.label.slice(0, 100),
    seedUrl: c.sourceUrl,
    seedSnippet: c.snippet || c.label,
    baseScore: c.matchScore,
    hitUrls: new Set([normalizeUrl(c.sourceUrl)]),
    accountUrls: new Set(),
    portraitIds: new Set(),
    aliases: new Set(extractAliases(blob, subject)),
    locations: new Set(extractLocations(blob)),
    employment: new Set(extractEmployment(blob)),
    associates: new Set(),
    timeline: extractYears(blob).map((y) => ({ date: y, label: `Mentioned in ${hostOf(c.sourceUrl)}`, sourceUrl: c.sourceUrl })),
    media: isNewsHit({ title: c.label, url: c.sourceUrl, snippet: c.snippet, source: "", query: "" })
      ? [{ title: c.label, url: c.sourceUrl, outlet: hostOf(c.sourceUrl), relevance: "seed" }]
      : [],
    reasoning: [`Seed profile from ${hostOf(c.sourceUrl)} (match ${c.matchScore}/100)`],
    edgeFlags: new Set(),
  };
}

function seedFromAccount(
  probe: UsernameProbe,
  scored: ScoredAccountSummary | undefined,
  subject: SubjectInput,
  idx: number,
): ProfileDraft {
  const blob = `${probe.displayName || ""} ${probe.bio || ""} ${probe.location || ""}`;
  const posterior = scored ? Math.round(scored.posterior * 100) : Math.round(probe.confidence);
  return {
    id: `account-${idx}`,
    displayName: probe.displayName || `@${probe.username} (${probe.platform})`,
    seedUrl: probe.url,
    seedSnippet: probe.bio || probe.displayName || probe.platform,
    baseScore: posterior,
    hitUrls: new Set(),
    accountUrls: new Set([normalizeUrl(probe.url)]),
    portraitIds: new Set(),
    aliases: new Set(extractAliases(blob, subject)),
    locations: new Set(probe.location ? [probe.location] : extractLocations(blob)),
    employment: new Set(extractEmployment(blob)),
    associates: new Set(),
    timeline: [],
    media: [],
    reasoning: [`Social profile seed: ${probe.platform} @${probe.username} (posterior ${posterior}%)`],
    edgeFlags: new Set(),
  };
}

function applyEdgeCaseFlags(draft: ProfileDraft, report: OsintReport, subject: SubjectInput): void {
  const blob = `${draft.seedSnippet} ${[...draft.hitUrls].join(" ")}`;
  if (isCommonName(subject.firstName, subject.lastName)) draft.edgeFlags.add("common-name");
  if (OBITUARY_PATTERNS.test(blob)) draft.edgeFlags.add("possible-deceased");
  if (/[^\x00-\x7F]/.test(fullName(subject) || "")) draft.edgeFlags.add("international-subject");
  if (draft.hitUrls.size + draft.accountUrls.size <= 1) draft.edgeFlags.add("low-digital-footprint");
  if (draft.media.length >= 2 || blob.toLowerCase().includes("wikipedia")) draft.edgeFlags.add("high-profile");
  if (draft.locations.size >= 3) draft.edgeFlags.add("contradictory-signals");
  if (report.excludedHits && report.excludedHits.length >= 4) draft.edgeFlags.add("homonym-noise-present");
}

function finalizeProfile(draft: ProfileDraft, rank: number, subject: SubjectInput): CandidateProfile {
  let likelihood = draft.baseScore;
  if (draft.accountUrls.size) likelihood += Math.min(15, draft.accountUrls.size * 5);
  if (draft.portraitIds.size) likelihood += Math.min(12, draft.portraitIds.size * 4);
  if (draft.media.length) likelihood += Math.min(10, draft.media.length * 3);

  const subjectLoc = locationLine(subject).toLowerCase();
  if (subjectLoc && [...draft.locations].some((l) => l.toLowerCase().includes(subjectLoc.split(",")[0]!))) {
    draft.reasoning.push(`Location aligns with intake: ${locationLine(subject)}`);
    likelihood += 5;
  }
  if (subject.employer && [...draft.employment].some((e) => e.toLowerCase().includes(subject.employer!.toLowerCase()))) {
    draft.reasoning.push(`Employment aligns with anchor: ${subject.employer}`);
    likelihood += 8;
  }

  if (draft.edgeFlags.has("possible-deceased")) likelihood -= 20;
  if (draft.edgeFlags.has("contradictory-signals")) likelihood -= 8;
  likelihood = Math.max(0, Math.min(100, Math.round(likelihood)));

  let verdict: CandidateProfile["verdict"] = "possible";
  if (likelihood >= 78) verdict = "likely";
  if (likelihood >= 88 && draft.accountUrls.size >= 1) verdict = "confirmed";
  if (draft.edgeFlags.has("possible-deceased") && !subject.employer) verdict = "possible";

  return {
    id: draft.id,
    displayName: draft.displayName,
    aliases: [...draft.aliases],
    likelihood,
    rank,
    verdict,
    reasoning: draft.reasoning.slice(0, 12),
    edgeCaseFlags: [...draft.edgeFlags],
    employment: [...draft.employment],
    locations: [...draft.locations],
    associates: [...draft.associates],
    timeline: draft.timeline.slice(0, 8),
    portraitIds: [...draft.portraitIds],
    accounts: [],
    mediaMentions: draft.media.slice(0, 6),
    sourceUrls: [...new Set([...draft.hitUrls, ...draft.accountUrls])].slice(0, 20),
    primaryUrl: draft.seedUrl,
    userAssignment: "pending",
  };
}

function attachAccounts(
  profiles: CandidateProfile[],
  probes: UsernameProbe[],
  scored: ScoredAccountSummary[],
): void {
  const scoredMap = new Map(scored.map((s) => [normalizeUrl(s.url), s]));
  for (const profile of profiles) {
    const attached = new Set<string>();
    for (const probe of probes.filter((p) => p.exists)) {
      const key = normalizeUrl(probe.url);
      if (!profile.sourceUrls.some((u) => normalizeUrl(u) === key)) continue;
      if (attached.has(key)) continue;
      attached.add(key);
      const s = scoredMap.get(key);
      const row: CandidateProfileAccount = {
        platform: probe.platform,
        username: probe.username,
        url: probe.url,
        tier: s?.tier || "discovered",
        posterior: s ? Math.round(s.posterior * 100) : probe.confidence,
        displayName: probe.displayName,
        bio: probe.bio,
        location: probe.location,
        portraitVerdict: s?.portraitVerdict,
      };
      profile.accounts.push(row);
      if (probe.displayName && !profile.aliases.includes(probe.displayName)) {
        profile.aliases.push(probe.displayName);
      }
    }
    profile.accounts.sort((a, b) => b.posterior - a.posterior);
  }
}

export function buildCandidateProfiles(report: OsintReport): CandidateProfile[] {
  const { subject } = report;
  const probes = report.usernameProbes || [];
  const scored = report.scoredAccounts || [];
  const portraits = report.portraitIntel?.candidates || [];
  const scoredMap = new Map(scored.map((s) => [normalizeUrl(s.url), s]));

  const drafts: ProfileDraft[] = [];

  const disambCandidates = [...report.disambiguation.candidates].sort((a, b) => {
    const aLi = isLinkedInProfileUrl(a.sourceUrl) ? 1 : 0;
    const bLi = isLinkedInProfileUrl(b.sourceUrl) ? 1 : 0;
    if (aLi !== bLi) return bLi - aLi;
    return b.matchScore - a.matchScore;
  });
  for (const c of disambCandidates) {
    drafts.push(seedFromIdentityCandidate(c, subject));
  }

  const linkedAccounts = new Set<string>();
  for (const draft of drafts) {
    for (const probe of probes.filter((p) => p.exists)) {
      const s = scoredMap.get(normalizeUrl(probe.url));
      if (accountMatchesSeed(probe, s, draft, subject)) {
        draft.accountUrls.add(normalizeUrl(probe.url));
        linkedAccounts.add(normalizeUrl(probe.url));
        draft.reasoning.push(`Linked ${probe.platform} @${probe.username} via cross-reference`);
        if (probe.location) draft.locations.add(probe.location);
      }
    }
    for (const portrait of portraits) {
      if (portraitMatchesSeed(portrait, draft)) {
        draft.portraitIds.add(portrait.id);
        draft.reasoning.push(`Portrait linked from ${portrait.platform}`);
      }
    }
    for (const hit of report.searchHits) {
      if (hitRelatesToSeed(hit, draft, subject)) {
        const key = normalizeUrl(hit.url);
        if (!draft.hitUrls.has(key)) {
          draft.hitUrls.add(key);
          if (isNewsHit(hit)) {
            draft.media.push({
              title: hit.title,
              url: hit.url,
              outlet: hostOf(hit.url),
              date: extractYears(`${hit.title} ${hit.snippet}`)[0],
              tone: hit.classification === "corroborated" ? "corroborated" : "mention",
            });
            draft.reasoning.push(`News/media: ${hit.title.slice(0, 60)}`);
          }
        }
      }
    }
    applyEdgeCaseFlags(draft, report, subject);
  }

  probes
    .filter((p) => p.exists && !linkedAccounts.has(normalizeUrl(p.url)))
    .filter((p) => {
      if (p.platform === "GitHub" && !githubProbeMatchesSubject(p, subject)) return false;
      return true;
    })
    .slice(0, 4)
    .forEach((probe, i) => {
      const s = scoredMap.get(normalizeUrl(probe.url));
      if (s && s.tier === "quarantined" && s.posterior < 0.35) return;
      const d = seedFromAccount(probe, s, subject, i);
      for (const portrait of portraits) {
        if (portrait.profileUrl && normalizeUrl(portrait.profileUrl) === normalizeUrl(probe.url)) {
          d.portraitIds.add(portrait.id);
        }
      }
      applyEdgeCaseFlags(d, report, subject);
      drafts.push(d);
    });

  if (!drafts.length && report.searchHits.length) {
    const top = report.searchHits
      .filter((h) => nameMatchesInText(subject.firstName, subject.lastName, `${h.title} ${h.snippet}`) >= 0.6)
      .slice(0, 3);
    top.forEach((h, i) => {
      drafts.push(
        seedFromIdentityCandidate(
          {
            id: `fallback-${i}`,
            label: h.title,
            sourceUrl: h.url,
            snippet: h.snippet,
            matchScore: Math.round((h.relevanceScore || 40) * 0.8),
          },
          subject,
        ),
      );
    });
  }

  const profiles = drafts
    .map((d, i) => finalizeProfile(d, i + 1, subject))
    .sort((a, b) => b.likelihood - a.likelihood)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  attachAccounts(profiles, probes, scored);
  return profiles.slice(0, 8);
}

export function suggestProfileMerges(profiles: CandidateProfile[]): IdentityWorkbench["mergeSuggestions"] {
  const suggestions: IdentityWorkbench["mergeSuggestions"] = [];
  const byDisplay = new Map<string, string[]>();
  for (const p of profiles) {
    const key = p.displayName.toLowerCase().slice(0, 40);
    const ids = byDisplay.get(key) || [];
    ids.push(p.id);
    byDisplay.set(key, ids);
  }
  for (const [name, ids] of byDisplay) {
    if (ids.length >= 2) {
      suggestions.push({ profileIds: ids, reason: `Same display name: "${name}"` });
    }
  }
  return suggestions.slice(0, 4);
}

export function buildIdentityWorkbench(report: OsintReport): IdentityWorkbench {
  const profiles = buildCandidateProfiles(report);
  const homonymRisk = report.disambiguation.homonymRisk;
  const multi = profiles.filter((p) => p.verdict !== "ruled-out").length >= 2;
  const lowConfidence = report.disambiguation.score < 80;
  const required =
    !report.identityWorkbench?.confirmed &&
    multi &&
    (homonymRisk !== "low" || lowConfidence || isCommonName(report.subject.firstName, report.subject.lastName));

  const top = profiles[0];
  const summary =
    profiles.length === 0
      ? "No distinct candidate profiles extracted - add anchors (username, email, domain) and refine."
      : required
        ? `${profiles.length} candidate profile(s) surfaced. Confirm TARGET before export or deeper harvesting.`
        : profiles.length === 1
          ? `Single dominant candidate (${top?.displayName?.slice(0, 50) || "unknown"}) - review and confirm if operational use requires it.`
          : `${profiles.length} candidates ranked; homonym risk ${homonymRisk}. Top: ${top?.displayName?.slice(0, 50)} (${top?.likelihood}%).`;

  return {
    required,
    homonymRisk,
    candidateCount: profiles.length,
    profiles,
    selectedTargetId: report.identityWorkbench?.selectedTargetId,
    confirmed: Boolean(report.identityWorkbench?.confirmed),
    summary,
    mergeSuggestions: suggestProfileMerges(profiles),
  };
}

export function applyIdentitySelection(
  workbench: IdentityWorkbench,
  targetId: string,
  excludedIds: string[] = [],
  mergeIds: string[] = [],
): IdentityWorkbench {
  const excluded = new Set([...excludedIds, ...mergeIds.filter((id) => id !== targetId)]);
  const profiles = workbench.profiles.map((p) => {
    if (p.id === targetId) return { ...p, userAssignment: "target" as const, verdict: "confirmed" as const };
    if (excluded.has(p.id)) return { ...p, userAssignment: "excluded" as const, verdict: "ruled-out" as const };
    return p;
  });
  return {
    ...workbench,
    profiles,
    selectedTargetId: targetId,
    confirmed: true,
    required: false,
    summary: `Identity locked: ${profiles.find((p) => p.id === targetId)?.displayName?.slice(0, 80) || targetId}. ${excluded.size} candidate(s) excluded.`,
  };
}

/** URLs to persist as negative signals when user excludes candidates. */
export function excludedUrlsFromProfiles(profiles: CandidateProfile[]): string[] {
  return profiles
    .filter((p) => p.userAssignment === "excluded")
    .flatMap((p) => p.sourceUrls)
    .map(normalizeUrl);
}

