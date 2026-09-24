import type { SearchHit, SocialCandidate, SubjectInput } from "../types.js";
import { deriveUsernames } from "./subject.js";
import { nameMatchesInText } from "./name-variants.js";

const PLATFORMS: Array<{ name: string; url: (u: string) => string; pattern: RegExp }> = [
  { name: "GitHub", url: (u) => `https://github.com/${u}`, pattern: /github\.com\/([^/?#]+)/i },
  { name: "LinkedIn", url: (u) => `https://www.linkedin.com/in/${u}`, pattern: /linkedin\.com\/in\/([^/?#]+)/i },
  { name: "Twitter/X", url: (u) => `https://x.com/${u}`, pattern: /(twitter|x)\.com\/([^/?#]+)/i },
  { name: "Reddit", url: (u) => `https://www.reddit.com/user/${u}`, pattern: /reddit\.com\/user\/([^/?#]+)/i },
  { name: "Instagram", url: (u) => `https://www.instagram.com/${u}/`, pattern: /instagram\.com\/([^/?#]+)/i },
];

export function discoverFromSearch(hits: SearchHit[], subject?: SubjectInput): SocialCandidate[] {
  const found: SocialCandidate[] = [];
  for (const hit of hits) {
    for (const platform of PLATFORMS) {
      const match = hit.url.match(platform.pattern);
      if (match) {
        const handle = match[match.length - 1];
        if (["search", "login", "signup", "explore"].includes(handle.toLowerCase())) continue;
        const isLinkedIn = platform.name === "LinkedIn";
        const isGitHub = platform.name === "GitHub";
        const blob = `${hit.title} ${hit.snippet}`;
        const nameMatch = subject ? nameMatchesInText(subject.firstName, subject.lastName, blob) : 1;
        let confidence = isLinkedIn ? 92 : 85;
        let status: SocialCandidate["status"] = "found";
        if (isGitHub && nameMatch < 0.7) {
          confidence = 32;
          status = "possible";
        }
        found.push({
          platform: platform.name,
          url: hit.url,
          confidence,
          method: "search-hit",
          status,
          verified: isLinkedIn,
        });
      }
    }
  }
  return dedupeSocial(found);
}

/** LinkedIn slugs are not first+last - skip blind username guessing. */
const USERNAME_GUESS_PLATFORMS = PLATFORMS.filter((p) => p.name !== "LinkedIn");

export function discoverFromUsernames(subject: SubjectInput): SocialCandidate[] {
  const usernames = deriveUsernames(subject);
  const candidates: SocialCandidate[] = [];

  for (const username of usernames) {
    for (const platform of USERNAME_GUESS_PLATFORMS) {
      candidates.push({
        platform: platform.name,
        url: platform.url(username),
        confidence: platform.name === "GitHub" ? 28 : 45,
        method: "username-pattern",
        status: "possible",
      });
    }
  }
  return candidates;
}

function dedupeSocial(items: SocialCandidate[]): SocialCandidate[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.platform}:${i.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeSocial(searchHits: SocialCandidate[], patterns: SocialCandidate[]): SocialCandidate[] {
  const map = new Map<string, SocialCandidate>();
  for (const p of patterns) map.set(`${p.platform}:${p.url}`, p);
  for (const s of searchHits) {
    const key = `${s.platform}:${s.url}`;
    const existing = map.get(key);
    if (!existing || s.confidence > existing.confidence) map.set(key, s);
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 12);
}