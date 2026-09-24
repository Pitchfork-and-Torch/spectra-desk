import type { MediaTimeline, MediaTimelineEntry, OsintReport, SearchHit } from "../types.js";
import { nameMatchesInText } from "./name-variants.js";

const NEWS_DOMAINS =
  /(?:reuters|bbc\.co|nytimes|washingtonpost|theguardian|apnews|cnn\.com|npr\.org|bloomberg|forbes|techcrunch|arstechnica|wired\.com|politico|nbcnews|cbsnews|latimes|usatoday|huffpost|medium\.com)/i;

const LEGAL_DOMAINS = /(?:courtlistener|pacer|uscourts|law\.justia|findlaw|leagle)/i;
const NEGATIVE_TONE = /(?:arrest|charged|indicted|convicted|scandal|fraud|lawsuit|controversy|alleged)/i;
const POSITIVE_TONE = /(?:award|honored|promoted|founded|raised|launch|success|celebrat)/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractYear(text: string): string | undefined {
  const years = [...text.matchAll(/\b(20\d{2}|19\d{2})\b/g)].map((m) => m[1]!);
  return years.sort().reverse()[0];
}

function inferTone(hit: SearchHit): MediaTimelineEntry["tone"] {
  const blob = `${hit.title} ${hit.snippet} ${hit.url}`;
  if (LEGAL_DOMAINS.test(hit.url)) return "legal";
  if (NEGATIVE_TONE.test(blob)) return "negative";
  if (POSITIVE_TONE.test(blob)) return "positive";
  return "neutral";
}

function relevanceScore(hit: SearchHit, subject: OsintReport["subject"]): number {
  let score = hit.relevanceScore || 40;
  const nameMatch = nameMatchesInText(subject.firstName, subject.lastName, `${hit.title} ${hit.snippet}`);
  score += Math.round(nameMatch * 25);
  if (hit.classification === "corroborated") score += 20;
  if (NEWS_DOMAINS.test(hit.url)) score += 10;
  if (LEGAL_DOMAINS.test(hit.url)) score += 8;
  return Math.min(100, score);
}

function isMediaHit(hit: SearchHit): boolean {
  const blob = `${hit.title} ${hit.url} ${hit.snippet}`;
  return (
    NEWS_DOMAINS.test(hit.url) ||
    LEGAL_DOMAINS.test(hit.url) ||
    /\/news\/|\/article\/|\/story\/|\/press\//i.test(hit.url) ||
    /\b(interview|profile|obituary|report|coverage)\b/i.test(blob)
  );
}

export function buildMediaTimeline(report: OsintReport): MediaTimeline {
  const targetUrls = report.identityWorkbench?.confirmed
    ? new Set(
        (report.identityWorkbench.profiles.find((p) => p.id === report.identityWorkbench!.selectedTargetId)?.sourceUrls || []).map(
          (u) => u.split("#")[0],
        ),
      )
    : null;

  const seen = new Set<string>();
  const entries: MediaTimelineEntry[] = [];

  for (const hit of report.searchHits) {
    if (!isMediaHit(hit) && hit.classification !== "corroborated") continue;
    const key = hit.url.split("#")[0];
    if (seen.has(key)) continue;
    if (targetUrls && targetUrls.size > 0 && !targetUrls.has(key) && hit.classification !== "corroborated") continue;
    seen.add(key);

    const date = extractYear(`${hit.title} ${hit.snippet}`);
    entries.push({
      id: `media-${entries.length}`,
      date,
      sortDate: date || "0000",
      title: hit.title.slice(0, 200),
      url: hit.url,
      outlet: hostOf(hit.url),
      snippet: hit.snippet?.slice(0, 280) || "",
      tone: inferTone(hit),
      relevance: relevanceScore(hit, report.subject),
      classification: hit.classification,
    });
  }

  entries.sort((a, b) => b.sortDate.localeCompare(a.sortDate) || b.relevance - a.relevance);

  const contradictions: string[] = [];
  const locations = new Set<string>();
  const locRe = /\b(?:in|from|based in)\s+([A-Z][a-z]+(?:,\s*[A-Z]{2})?)/g;
  for (const e of entries) {
    let m: RegExpExecArray | null;
    const re = new RegExp(locRe.source, locRe.flags);
    while ((m = re.exec(e.snippet)) !== null) locations.add(m[1]!);
  }
  if (locations.size >= 4) {
    contradictions.push(`Multiple geographic signals across media (${[...locations].slice(0, 5).join("; ")}) - verify single identity.`);
  }
  const tones = entries.map((e) => e.tone);
  if (tones.includes("negative") && tones.includes("positive")) {
    contradictions.push("Mixed positive and negative coverage - review chronology for evolving narrative.");
  }

  const summary =
    entries.length === 0
      ? "No dedicated news or press hits retained - broaden search anchors or run full query mode."
      : `${entries.length} media mention(s) across ${new Set(entries.map((e) => e.outlet)).size} outlet(s). Newest dated signal: ${entries[0]?.date || "unknown"}.`;

  return { entries: entries.slice(0, 40), summary, contradictions };
}