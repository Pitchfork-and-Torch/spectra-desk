import { createHash } from "node:crypto";
import type { SearchHit, SocialCandidate, SubjectInput } from "../types.js";
import { extractAnchors } from "./anchors.js";
import { classifyHit } from "./homonym-filter.js";
import { nameMatchesInText } from "./name-variants.js";
import { fetchGitHubProfile, parseGitHubUsername } from "./github.js";
import { anchorMatchScore } from "./anchors.js";
import { urlIsNegativelyMarked } from "./negative-signals.js";
import { platformRelevanceBoost } from "./platform-scoring.js";
import { locationLine } from "./subject.js";

export async function checkGravatar(email: string): Promise<boolean> {
  const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  try {
    const res = await fetch(`https://www.gravatar.com/avatar/${hash}?d=404`, { method: "HEAD" });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function verifyPublicProfile(url: string): Promise<boolean> {
  if (/linkedin\.com\/in\//i.test(url)) {
    // LinkedIn blocks bots; search-discovered /in/ URLs are treated as valid when scored upstream
    return true;
  }
  const ghUser = parseGitHubUsername(url);
  if (ghUser) {
    const profile = await fetchGitHubProfile(ghUser);
    return profile !== null;
  }
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "SpectraDesk-OSINT/2.0" },
      signal: AbortSignal.timeout(10_000),
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

export async function verifySocialCandidates(candidates: SocialCandidate[], limit = 12): Promise<SocialCandidate[]> {
  const out: SocialCandidate[] = [];
  for (const c of candidates.slice(0, limit)) {
    if (c.method === "search-hit" && c.status === "found") {
      out.push(c);
      continue;
    }
    if (c.method === "search-hit" && c.confidence < 50) {
      out.push({ ...c, status: "possible", verified: false });
      continue;
    }
    const ok = await verifyPublicProfile(c.url);
    const isAssociate = c.confidence < 55 || (c.method === "search-hit" && !c.verified);
    out.push({
      ...c,
      status: ok ? (isAssociate ? "found" : "verified") : "not-found",
      confidence: ok ? (isAssociate ? Math.min(c.confidence, 48) : Math.max(c.confidence, 78)) : 12,
      method: ok && !isAssociate ? "verified" : c.method,
      verified: ok && !isAssociate,
    });
  }
  return out;
}

export function scoreHitRelevance(
  hit: { title: string; snippet: string; url: string },
  subject: SubjectInput,
  nameMatchFn: (f: string | undefined, l: string | undefined, t: string) => number,
): number {
  const text = `${hit.title} ${hit.snippet} ${hit.url}`;
  const anchors = extractAnchors(subject);
  const nameScore = nameMatchFn(subject.firstName, subject.lastName, text) * 30;
  const { score: anchorBoost, signals } = anchorMatchScore(text, hit.url, anchors);

  let score = nameScore + anchorBoost;

  if (/wikipedia\.org/i.test(hit.url) && anchorBoost === 0) score -= 5;

  const platform = platformRelevanceBoost(hit, subject);
  score += platform.boost;
  signals.push(...platform.signals);

  let { classification, reason } = classifyHit(hit, anchors, signals, subject.lastName);
  if (/linkedin\.com\/in\//i.test(hit.url) && locationLine(subject) && platform.signals.some((s) => s.startsWith("location:"))) {
    classification = "corroborated";
    reason = `LinkedIn profile corroborates intake location (${locationLine(subject)})`;
  }
  // Full-name public-record / news hits are strong identity signal even without LinkedIn
  if (
    classification !== "excluded" &&
    subject.lastName &&
    nameMatchFn(subject.firstName, subject.lastName, text) >= 0.85 &&
    /mugshot|arrest|mma|sherdog|espn\.com|court|sunbiz|opencorporates|linkedin\.com/i.test(text)
  ) {
    score += 18;
  }
  if (classification === "excluded") score = Math.max(5, score - 45);
  if (classification === "corroborated") score += 20;

  return Math.min(100, Math.round(score));
}

export function enrichSearchHits(hits: SearchHit[], subject: SubjectInput): { kept: SearchHit[]; excluded: SearchHit[] } {
  const anchors = extractAnchors(subject);
  const kept: SearchHit[] = [];
  const excluded: SearchHit[] = [];
  const seen = new Set<string>();

  const sorted = [...hits].sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  for (const hit of sorted) {
    const key = hit.url.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);

    const { score: anchorBoost, signals: anchorSignals } = anchorMatchScore(`${hit.title} ${hit.snippet}`, hit.url, anchors);
    const platform = platformRelevanceBoost(hit, subject);
    const mergedSignals = [...anchorSignals, ...platform.signals];
    let { classification, reason } = classifyHit(hit, anchors, mergedSignals, subject.lastName);
    if (/linkedin\.com\/in\//i.test(hit.url) && locationLine(subject) && platform.signals.some((s) => s.startsWith("location:"))) {
      classification = "corroborated";
      reason = `LinkedIn profile corroborates intake location (${locationLine(subject)})`;
    }
    // Full-name identity hits in public records / sports / news → treat as corroborated when surname matches
    if (
      classification === "possible" &&
      subject.lastName &&
      nameMatchesInText(subject.firstName, subject.lastName, `${hit.title} ${hit.snippet}`) >= 0.85 &&
      /mugshot|arrest|mma|sherdog|espn\.com|florida|tampa|court|linkedin\.com/i.test(`${hit.title} ${hit.snippet} ${hit.url}`)
    ) {
      classification = "corroborated";
      reason = "Full-name public-record/news identity hit";
      mergedSignals.push("full-name-public-record");
    }
    const neg = urlIsNegativelyMarked(subject.firstName, subject.lastName, hit.url);
    if (neg) {
      classification = "excluded";
      reason = `User-marked wrong identity: ${neg.reason}`;
    }

    const enriched: SearchHit = {
      ...hit,
      classification,
      exclusionReason: reason,
      anchorSignals: mergedSignals,
      relevanceScore: hit.relevanceScore ?? scoreHitRelevance(hit, subject, nameMatchesInText),
    };

    if (classification === "excluded" && anchorBoost === 0) {
      excluded.push(enriched);
    } else {
      kept.push(enriched);
    }
  }

  return { kept, excluded };
}