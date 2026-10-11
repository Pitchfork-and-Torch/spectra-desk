import * as cheerio from "cheerio";
import type { SubjectInput } from "../types.js";
import { extractAnchors } from "./anchors.js";
import { fullName, locationLine } from "./subject.js";
import type { GitHubIntel } from "../types.js";
import type { DomainIntel } from "../types.js";
import { isLinkedInProfileUrl } from "./platform-scoring.js";
import { searchBingHtml, searchFirecrawl } from "./search-external.js";
import { unwrapSearchUrl } from "./search-url.js";

export interface SearchHitLite {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface SearchBatchHealth {
  attempted: number;
  withHits: number;
  empty: number;
  degraded: boolean;
  fallbackHits: number;
}

/** Per-engine circuit breaker - skip engines after repeated captcha/timeouts. */
export class SearchCircuitBreaker {
  private readonly strikes = new Map<string, number>();
  constructor(private readonly tripAfter = 2) {}

  isOpen(engineId: string): boolean {
    return (this.strikes.get(engineId) ?? 0) >= this.tripAfter;
  }

  recordFailure(engineId: string): void {
    this.strikes.set(engineId, (this.strikes.get(engineId) ?? 0) + 1);
  }

  recordSuccess(engineId: string): void {
    this.strikes.set(engineId, 0);
  }
}

export const globalSearchBreaker = new SearchCircuitBreaker();

/** DuckDuckGo Instant Answer API - no browser, no captcha (limited but reliable). */
export async function searchDuckDuckGoInstant(query: string, limit: number): Promise<SearchHitLite[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "SpectraDesk-OSINT/4.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      AbstractURL?: string;
      AbstractText?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
    };

    const hits: SearchHitLite[] = [];
    if (data.AbstractURL && data.AbstractText) {
      hits.push({
        title: data.Heading || data.AbstractText.slice(0, 80),
        url: data.AbstractURL,
        snippet: data.AbstractText.slice(0, 240),
        source: "ddg-instant-api",
      });
    }

    const flatten = (topics: typeof data.RelatedTopics) => {
      for (const t of topics ?? []) {
        if (hits.length >= limit) break;
        if (t.FirstURL && t.Text) {
          hits.push({ title: t.Text.slice(0, 120), url: t.FirstURL, snippet: t.Text.slice(0, 240), source: "ddg-instant-api" });
        }
        if (t.Topics) flatten(t.Topics);
      }
    };
    flatten(data.RelatedTopics);

    return hits.slice(0, limit);
  } catch {
    return [];
  }
}

/** DDG HTML via fetch - often works when Playwright triggers captcha. */
export async function searchDuckDuckGoHtml(query: string, limit: number): Promise<SearchHitLite[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const hits: SearchHitLite[] = [];
    $("a.result__a").each((_, el) => {
      if (hits.length >= limit) return false;
      const title = $(el).text().trim();
      const href = $(el).attr("href") || "";
      if (!title || !href.startsWith("http")) return;
      const snippet = $(el).closest(".result").find(".result__snippet").text().trim().slice(0, 240);
      hits.push({ title, url: href, snippet, source: "ddg-html-fetch" });
    });
    return hits;
  } catch {
    return [];
  }
}

function mergeSearchHits(...groups: SearchHitLite[][]): SearchHitLite[] {
  const seen = new Set<string>();
  const out: SearchHitLite[] = [];
  for (const g of groups) {
    for (const h of g) {
      const url = unwrapSearchUrl(h.url);
      if (/bing\.com\/ck\//i.test(url)) continue;
      const key = url.split("#")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...h, url });
    }
  }
  return out;
}

/** Try HTTP-only search stack before launching a browser (captcha-resistant). */
export async function searchHttpStack(query: string, limit: number): Promise<SearchHitLite[]> {
  const linkedInPriority = /linkedin/i.test(query);
  const minHits = linkedInPriority ? 1 : Math.min(2, limit);

  const [instant, html, bing, firecrawl] = await Promise.all([
    searchDuckDuckGoInstant(query, limit),
    searchDuckDuckGoHtml(query, limit),
    searchBingHtml(query, limit),
    searchFirecrawl(query, limit),
  ]);

  const merged = mergeSearchHits(firecrawl, bing, html, instant);
  if (merged.length >= minHits) return merged.slice(0, limit);

  if (firecrawl.length) return firecrawl.slice(0, limit);
  if (bing.length) return bing.slice(0, limit);
  if (html.length) return html.slice(0, limit);
  return instant.slice(0, limit);
}

/** When browser search degrades, synthesize LinkedIn discovery pivot from intake anchors. */
export function buildProfessionalSearchFallback(subject: SubjectInput): SearchHitLite[] {
  const name = fullName(subject);
  const loc = locationLine(subject);
  if (!name || !loc) return [];
  return [
    {
      title: `${name} - professional profile search (LinkedIn pivot)`,
      url: `https://www.linkedin.com/pub/dir/?first=${encodeURIComponent(subject.firstName || "")}&last=${encodeURIComponent(subject.lastName || "")}`,
      snippet: `Public LinkedIn directory pivot for ${name} in ${loc}. Confirm profile via Identity Workbench.`,
      source: "professional-pivot",
    },
  ];
}

/** Synthesize corroborating hits from anchors when browser search is blocked. */
export function buildAnchorFallbackHits(
  subject: SubjectInput,
  githubIntel?: GitHubIntel | null,
  domainIntel?: DomainIntel | null,
): SearchHitLite[] {
  const anchors = extractAnchors(subject);
  const hits: SearchHitLite[] = [];
  const name = fullName(subject) || "Subject";

  for (const d of anchors.domains.slice(0, 2)) {
    hits.push({
      title: `${name} - owned site ${d}`,
      url: `https://${d}`,
      snippet: domainIntel?.siteDescription || domainIntel?.siteTitle || `Anchor domain from investigation subject`,
      source: "anchor-domain",
    });
  }

  if (githubIntel?.url) {
    hits.push({
      title: `GitHub: ${githubIntel.login}`,
      url: githubIntel.url,
      snippet: [githubIntel.name, githubIntel.bio, githubIntel.blog].filter(Boolean).join(" | "),
      source: "anchor-github",
    });
    if (githubIntel.blog) {
      const blog = githubIntel.blog.startsWith("http") ? githubIntel.blog : `https://${githubIntel.blog}`;
      hits.push({
        title: `GitHub blog link: ${githubIntel.blog}`,
        url: blog,
        snippet: `Linked from @${githubIntel.login}`,
        source: "anchor-github",
      });
    }
  }

  for (const u of anchors.usernames.slice(0, 2)) {
    hits.push({
      title: `GitHub profile search: @${u}`,
      url: `https://github.com/${u}`,
      snippet: `Username anchor - direct platform URL`,
      source: "anchor-username",
    });
  }

  const loc = locationLine(subject);
  if (!hits.some((h) => isLinkedInProfileUrl(h.url)) && name && loc) {
    hits.push(...buildProfessionalSearchFallback(subject));
  }

  return hits;
}

export function assessSearchBatchHealth(
  results: Map<string, SearchHitLite[]>,
): SearchBatchHealth {
  const attempted = results.size;
  let withHits = 0;
  for (const hits of results.values()) {
    if (hits.length > 0) withHits++;
  }
  const empty = attempted - withHits;
  const degraded = attempted >= 4 && withHits / Math.max(1, attempted) < 0.2;
  return { attempted, withHits, empty, degraded, fallbackHits: 0 };
}

export function adaptiveSearchConcurrency(health: SearchBatchHealth, defaultConcurrency = 3): number {
  if (health.degraded) return 1;
  if (health.empty >= 3 && health.withHits === 0) return 1;
  return defaultConcurrency;
}

/** Stop burning queries when browser search is clearly blocked and we have anchor signal. */
export function shouldEarlyStopSearch(
  processed: number,
  total: number,
  health: SearchBatchHealth,
  hasAnchorFallback: boolean,
): boolean {
  if (!hasAnchorFallback) return false;
  if (processed < Math.min(6, total)) return false;
  return health.degraded && health.withHits <= 1;
}