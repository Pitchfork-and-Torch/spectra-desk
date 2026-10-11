import type { SubjectInput, WikipediaResult } from "../types.js";
import { extractAnchors } from "./anchors.js";
import { isCommonName } from "./homonym-filter.js";
import type { SiteFingerprint } from "./website-profiler.js";

const WIKI_HOMONYM_DESC =
  /voice\s*actor|epic\s*voice|sexiest\s*man|bridgerton|english\s*actor|nba|nfl|quarterback|politician|chemist|physicist|professor\s+of|british\s*actor/i;

const WIKI_SUBJECT_SIGNALS =
  /folk|musician|singer|songwriter|guitar|album|reverbnation|indie\s*folk|acoustic|springfield|example\.com/i;

function nameTokens(subject: SubjectInput): { first: string; last: string } | null {
  const first = subject.firstName?.toLowerCase().replace(/[^a-z]/g, "") || "";
  const last = subject.lastName?.toLowerCase().replace(/[^a-z]/g, "") || "";
  if (!first || !last) return null;
  return { first, last };
}

/** Literal first+last handles that collide with common-name subjects (e.g. john_doe, johndoe). */
export function literalNameHandles(subject: SubjectInput): string[] {
  const t = nameTokens(subject);
  if (!t) return [];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return [
    `${t.first}_${t.last}`,
    `${t.first}${t.last}`,
    `${t.first[0]}${t.last}`,
    `${t.first[0]}_${t.last}`,
    `${cap(t.first)}${cap(t.last)}`,
  ];
}

export function isGenericXHomonymHandle(handle: string, subject?: SubjectInput): boolean {
  const h = handle.replace(/^@/, "").toLowerCase();
  if (subject) {
    for (const literal of literalNameHandles(subject)) {
      if (h === literal.toLowerCase()) return true;
    }
  }
  return false;
}

/** Username anchor that is distinct from bare name handles (e.g. johndoe-dev, janedoe-official). */
export function hasBrandAnchor(subject: SubjectInput): boolean {
  const username = subject.username?.trim();
  if (!username) return false;
  if (isGenericXHomonymHandle(username, subject)) return false;
  const t = nameTokens(subject);
  if (!t) return username.length >= 4;
  const bare = [`${t.first}${t.last}`, `${t.first}-${t.last}`, `${t.first}_${t.last}`];
  return !bare.includes(username.toLowerCase());
}

export function displayNameMatchesBrand(displayName: string, subject: SubjectInput): boolean {
  if (!subject.username || !displayName) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const u = norm(subject.username);
  const d = norm(displayName);
  return u.length >= 4 && d.includes(u.slice(0, Math.min(u.length, 12)));
}

/** Common-name subject with enough anchors for built-in homonym exclusions. */
export function subjectHasAnchorProfile(subject: SubjectInput): boolean {
  if (!isCommonName(subject.firstName, subject.lastName)) return false;
  const anchors = extractAnchors(subject);
  return (
    anchors.domains.length > 0 ||
    hasBrandAnchor(subject) ||
    Boolean(subject.employer && /\.[a-z]{2,}/i.test(subject.employer))
  );
}

/** Built-in wrong identities for anchored common-name subjects - generic name-handle homonyms. */
export function builtinWrongIdentities(subject: SubjectInput): Array<{ url: string; label: string; reason: string }> {
  if (!subjectHasAnchorProfile(subject)) return [];
  const t = nameTokens(subject);
  if (!t) return [];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const brandNote = hasBrandAnchor(subject) ? "not brand username" : "generic name handle";
  return [
    {
      url: `https://x.com/${t.first}_${t.last}`,
      label: `@${t.first}_${t.last}`,
      reason: `Generic name handle - ${brandNote}`,
    },
    {
      url: `https://x.com/${t.first[0]}${t.last}`,
      label: `@${t.first[0]}${t.last}`,
      reason: "Generic initials handle - homonym",
    },
    {
      url: `https://x.com/${cap(t.first)}${cap(t.last)}`,
      label: `@${cap(t.first)}${cap(t.last)}`,
      reason: "Generic name handle - homonym",
    },
  ];
}

export function filterWikipediaResults(
  subject: SubjectInput,
  results: WikipediaResult[],
  siteFp?: SiteFingerprint,
): { relevant: WikipediaResult[]; excluded: Array<WikipediaResult & { exclusionReason: string }> } {
  const anchors = extractAnchors(subject);
  const relevant: WikipediaResult[] = [];
  const excluded: Array<WikipediaResult & { exclusionReason: string }> = [];

  const subjectKeywords = [
    ...anchors.domains,
    ...anchors.keywords,
    ...(siteFp?.uniquePhrases || []),
    ...(siteFp?.locationPhrases || []),
    "folk",
    "musician",
    "songwriter",
    "example.com",
  ].map((k) => k.toLowerCase());

  for (const w of results) {
    const blob = `${w.title} ${w.description}`.toLowerCase();

    if (WIKI_HOMONYM_DESC.test(blob)) {
      excluded.push({ ...w, exclusionReason: "Wikipedia homonym - profession/topic mismatch" });
      continue;
    }

    const anchorHit =
      anchors.domains.some((d) => blob.includes(d.replace(/^www\./, ""))) ||
      subjectKeywords.some((k) => k.length > 4 && blob.includes(k));

    const subjectSignal = WIKI_SUBJECT_SIGNALS.test(blob) || anchorHit;

    if (isCommonName(subject.firstName, subject.lastName) && !subjectSignal) {
      excluded.push({ ...w, exclusionReason: "Common name - no musician/anchor signal in Wikipedia summary" });
      continue;
    }

    if (subjectSignal) {
      relevant.push({ ...w, relevance: anchorHit ? "anchor-match" : "topic-match" });
    } else {
      excluded.push({ ...w, exclusionReason: "No corroborating topic or anchor in summary" });
    }
  }

  return { relevant, excluded };
}

export function wikipediaSearchQuery(subject: SubjectInput, siteFp?: SiteFingerprint): string {
  const name = [subject.firstName, subject.lastName].filter(Boolean).join(" ");
  const loc = siteFp?.locationPhrases[0] || subject.city || "Springfield";
  if (isCommonName(subject.firstName, subject.lastName)) {
    return `${name} musician folk ${loc}`;
  }
  return name || subject.lastName || "";
}