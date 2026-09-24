import type { SubjectAnchors } from "./anchors.js";

export type HitClassification = "corroborated" | "possible" | "excluded";

const NOISE_RULES: Array<{ pattern: RegExp; label: string; unlessAnchor?: RegExp }> = [
  { pattern: /epicvoiceguy|voice\s*actor|voiceover/i, label: "Entertainment/voice industry figure" },
  { pattern: /imdb\.com\/name/i, label: "IMDb performer profile", unlessAnchor: /imdb/i },
  { pattern: /transformers\s*wiki|tvtropes\.org/i, label: "Fandom/creator wiki (often homonym)" },
  { pattern: /tiktok\.com\/@epicvoiceguy/i, label: "Unrelated TikTok creator" },
  { pattern: /behavior\s*analysis|abainternational/i, label: "Academic/professional homonym" },
  // Sports profiles are only noise when they look like a different person (common-name athlete pages).
  // Full-name + subject-matching fighter/athlete pages stay eligible (LE / identity OSINT).
  { pattern: /fantasypros|rotoworld|espn\.com\/nba|espn\.com\/nfl|nfl\.com\/players|ufc\.com\/fighter/i, label: "Sports/athlete profile (likely homonym)" },
  { pattern: /comics\s*kingdom|comic\s*strip|stranger\s*things|dustin\s*henderson|fandom\.com\/wiki/i, label: "Fictional/comic first-name collision" },
  { pattern: /reddit\.com\/r\/\w+\/comments/i, label: "Reddit discussion thread (not an identity profile)", unlessAnchor: /reddit/i },
  { pattern: /findagrave|legacy\.com\/obituaries/i, label: "Obituary/memorial (verify anchors)" },
  { pattern: /whitepages|truepeoplesearch|spokeo/i, label: "People-search aggregator (weak signal)" },
];

export function classifyHit(
  hit: { title: string; snippet: string; url: string },
  anchors: SubjectAnchors,
  anchorSignals: string[],
  subjectLastName?: string,
): { classification: HitClassification; reason?: string } {
  const blob = `${hit.title} ${hit.snippet} ${hit.url}`.toLowerCase();

  const hasStrongAnchor = anchorSignals.length > 0 || anchors.usernames.some((u) => blob.includes(u) || hit.url.toLowerCase().includes(u))
    || anchors.domains.some((d) => blob.includes(d) || hit.url.toLowerCase().includes(d));

  if (hasStrongAnchor) return { classification: "corroborated" };

  // Last-name gate: when investigating an uncommon surname, drop first-name-only entertainment
  // (e.g. "Dustin" comic strip vs "Dustin Daprizio").
  if (subjectLastName && subjectLastName.length >= 4) {
    const last = subjectLastName.toLowerCase();
    if (!blob.includes(last)) {
      if (/comics?|comic\s*strip|fandom|wiki|henderson|stranger\s*things|kingdom/i.test(blob)) {
        return { classification: "excluded", reason: "First-name entertainment collision (surname absent)" };
      }
    }
  }

  for (const rule of NOISE_RULES) {
    if (rule.pattern.test(blob)) {
      if (rule.unlessAnchor && anchors.domains.some((d) => rule.unlessAnchor!.test(d))) continue;
      // Keep sports/news pages that carry the full subject surname (identity-bearing public records)
      if (/sports\/athlete/i.test(rule.label) && subjectLastName && blob.includes(subjectLastName.toLowerCase())) {
        continue;
      }
      return { classification: "excluded", reason: rule.label };
    }
  }

  const nameOnlyPlatforms = /facebook\.com\/watch|youtube\.com\/watch/i.test(hit.url);
  if (nameOnlyPlatforms && !hasStrongAnchor) {
    return { classification: "possible", reason: "Name-only media hit without anchor corroboration" };
  }

  return { classification: "possible" };
}

export function isCommonName(first?: string, last?: string): boolean {
  const commonFirst = /^(john|james|michael|david|robert|william|richard|joseph|thomas|chris|matt|dan|mark|jane)$/i;
  const commonLast = /^(smith|johnson|williams|brown|jones|miller|davis|bailey|wilson|moore|taylor)$/i;
  return Boolean(first && last && (commonFirst.test(first) || commonLast.test(last)));
}