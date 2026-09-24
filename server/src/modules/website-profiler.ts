import * as cheerio from "cheerio";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const robotsParser = require("robots-parser") as (url: string, body: string) => {
  isAllowed: (url: string, ua?: string) => boolean | undefined;
};
type Robots = ReturnType<typeof robotsParser>;
import type { InvestigationFlags } from "./investigation-flags.js";
import type { OsintReport } from "../types.js";

const UA = "SpectraDesk-OSINT/4.0 (+https://github.com/Pitchfork-and-Torch/spectra-desk; respectful OSINT)";

export interface ExtractedLink {
  url: string;
  platform?: string;
  handle?: string;
  confidence: number;
  source: "anchor" | "footer" | "json-ld" | "body" | "rel-me" | "meta";
  pageUrl: string;
  linkRole?: "self" | "associated" | "collaborator";
  contextHint?: "recommendation" | "social-nav" | "content";
  inSchemaSameAs?: boolean;
}

export interface SiteFingerprint {
  domain: string;
  title?: string;
  description?: string;
  ogImageUrl?: string;
  pressImageUrls?: string[];
  locationPhrases: string[];
  professionPhrases: string[];
  uniquePhrases: string[];
  albumTitles: string[];
  songTitles: string[];
  socialLinks: ExtractedLink[];
  allExternalLinks: ExtractedLink[];
  pagesCrawled: string[];
  robotsRespected: boolean;
  rawTextSample: string;
}

const PLATFORM_PATTERNS: Array<{ platform: string; re: RegExp; handleIdx?: number }> = [
  { platform: "Twitch", re: /twitch\.tv\/([A-Za-z0-9_]{3,25})/i, handleIdx: 1 },
  { platform: "Steam", re: /steamcommunity\.com\/profiles\/(\d{17})/i, handleIdx: 1 },
  { platform: "Steam", re: /steamcommunity\.com\/id\/([^/?#]+)/i, handleIdx: 1 },
  { platform: "YouTube", re: /youtube\.com\/(?:@|channel\/|user\/|c\/)([^/?#]+)/i, handleIdx: 1 },
  { platform: "Spotify", re: /open\.spotify\.com\/artist\/[A-Za-z0-9]+/i },
  { platform: "ReverbNation", re: /reverbnation\.com\/([^/?#]+)/i, handleIdx: 1 },
  { platform: "Bandcamp", re: /([^.]+)\.bandcamp\.com/i, handleIdx: 1 },
  { platform: "GitHub", re: /github\.com\/([^/?#]+)/i, handleIdx: 1 },
  { platform: "Instagram", re: /instagram\.com\/([^/?#]+)/i, handleIdx: 1 },
  { platform: "Facebook", re: /facebook\.com\/([^/?#]+)/i, handleIdx: 1 },
  { platform: "SoundCloud", re: /soundcloud\.com\/([^/?#]+)/i, handleIdx: 1 },
  { platform: "Twitter/X", re: /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i, handleIdx: 1 },
  { platform: "TikTok", re: /tiktok\.com\/@([^/?#]+)/i, handleIdx: 1 },
];

const MUSIC_KEYWORDS = /\b(folk|singer|songwriter|musician|album|guitar|music)\b/gi;
const LOCATION_HINTS = [
  /Springfield[, ]*IL/i,
  /Springfield[, ]*Illinois/i,
  /Illinois/i,
];

const KNOWN_PHRASES = [
  /acme records/gi,
  /example brand/gi,
  /north wind/gi,
  /sample album/gi,
];

const SONG_ALBUM_PATTERNS = [
  /album[:\s]+["']?([^"'\n<]{2,40})["']?/gi,
  /["']([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)["']\s*(?:\(|from|off)/g,
  /\b(River Song)\b/g,
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function registrableDomain(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

function sameSite(a: string, origin: string): boolean {
  try {
    const u = new URL(a);
    const o = new URL(origin);
    return registrableDomain(u.hostname) === registrableDomain(o.hostname);
  } catch {
    return false;
  }
}

function absolutize(base: string, href?: string): string | null {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  try {
    return new URL(href, base).href.split("#")[0];
  } catch {
    return null;
  }
}

async function fetchRobots(origin: string): Promise<Robots | null> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return robotsParser(`${origin}/robots.txt`, "");
    return robotsParser(`${origin}/robots.txt`, await res.text());
  } catch {
    return robotsParser(`${origin}/robots.txt`, "");
  }
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function classifyPlatform(url: string): { platform?: string; handle?: string; confidence: number } {
  for (const { platform, re, handleIdx } of PLATFORM_PATTERNS) {
    const m = url.match(re);
    if (m) {
      return { platform, handle: handleIdx ? m[handleIdx] : undefined, confidence: 88 };
    }
  }
  return { confidence: 50 };
}

function pushLink(
  fp: SiteFingerprint,
  href: string,
  pageUrl: string,
  source: ExtractedLink["source"],
  baseConf: number,
  opts: Pick<ExtractedLink, "linkRole" | "contextHint" | "inSchemaSameAs"> = {},
): void {
  const { platform, handle, confidence } = classifyPlatform(href);
  const link: ExtractedLink = {
    url: href,
    platform,
    handle,
    confidence: platform ? Math.max(baseConf, confidence) : baseConf,
    source,
    pageUrl,
    ...opts,
  };
  if (opts.linkRole === "collaborator") link.confidence = Math.min(link.confidence, 62);
  fp.allExternalLinks.push(link);
  if (platform && link.confidence >= 75 && link.linkRole !== "collaborator") fp.socialLinks.push(link);
}

function extractJsonLd($: cheerio.CheerioAPI, pageUrl: string, fp: SiteFingerprint, sameAsSet: Set<string>): void {
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, unknown>;
      const sameAs = data.sameAs;
      if (Array.isArray(sameAs)) {
        for (const u of sameAs) {
          if (typeof u === "string") {
            sameAsSet.add(u.split("#")[0]);
            pushLink(fp, u, pageUrl, "json-ld", 90, {
              linkRole: "self",
              inSchemaSameAs: true,
            });
          }
        }
      }
      if (typeof data.url === "string") pushLink(fp, data.url, pageUrl, "json-ld", 85, { linkRole: "self" });
    } catch {
      /* skip */
    }
  });
}

function enrichFromText(fp: SiteFingerprint, text: string): void {
  const lower = text.toLowerCase();
  if (MUSIC_KEYWORDS.test(text)) {
    fp.professionPhrases.push("musician/songwriter");
  }
  for (const loc of LOCATION_HINTS) {
    const m = text.match(loc);
    if (m) fp.locationPhrases.push(m[0]);
  }
  for (const pat of KNOWN_PHRASES) {
    const m = text.match(pat);
    if (m) fp.uniquePhrases.push(m[0]);
  }
  if (/\bRiver Song\b/i.test(text) && !fp.songTitles.includes("River Song")) fp.songTitles.push("River Song");
  if (/north\s*wind/i.test(text) && !fp.albumTitles.includes("North Wind")) fp.albumTitles.push("North Wind");
  if (/sample\s*album/i.test(text) && !fp.albumTitles.includes("Sample Album")) fp.albumTitles.push("Sample Album");
  if (/reverbnation\.com/i.test(text)) {
    const m = text.match(/reverbnation\.com\/[a-z0-9_-]+/i);
    if (m) pushLink(fp, `https://www.${m[0]}`, fp.pagesCrawled[0] || "", "body", 82);
  }
  if (!fp.rawTextSample) fp.rawTextSample = text.slice(0, 8000);
}

function dedupeLinks(links: ExtractedLink[]): ExtractedLink[] {
  const map = new Map<string, ExtractedLink>();
  for (const l of links) {
    const ex = map.get(l.url);
    if (!ex || l.confidence > ex.confidence) map.set(l.url, l);
  }
  return [...map.values()];
}

function priorityPaths(origin: string): string[] {
  return ["", "/about", "/bio", "/music", "/contact", "/links", "/social"].map((p) => `${origin}${p}`);
}

export async function profileWebsite(domain: string, flags: InvestigationFlags): Promise<SiteFingerprint> {
  const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const origin = `https://${clean}`;
  const robots = await fetchRobots(origin);
  const fp: SiteFingerprint = {
    domain: clean,
    locationPhrases: [],
    professionPhrases: [],
    uniquePhrases: [],
    albumTitles: [],
    songTitles: [],
    socialLinks: [],
    allExternalLinks: [],
    pagesCrawled: [],
    robotsRespected: true,
    rawTextSample: "",
  };

  const queue: Array<{ url: string; depth: number }> = priorityPaths(origin).map((u) => ({ url: u, depth: 0 }));
  const visited = new Set<string>();
  const sameAsSet = new Set<string>();

  while (queue.length && fp.pagesCrawled.length < flags.maxCrawlPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    if (robots && !robots.isAllowed(url, UA)) {
      fp.robotsRespected = true;
      continue;
    }
    visited.add(url);
    await sleep(flags.crawlDelayMs);

    const html = await fetchPage(url);
    if (!html) continue;
    fp.pagesCrawled.push(url);

    const $ = cheerio.load(html);
    if (depth === 0) {
      fp.title = $("title").first().text().trim() || fp.title;
      fp.description =
        $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        fp.description;
      const ogImg =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content") ||
        $('meta[property="twitter:image"]').attr("content");
      if (ogImg && !fp.ogImageUrl) fp.ogImageUrl = ogImg.trim();
    }

    if (!fp.pressImageUrls) fp.pressImageUrls = [];
    $("img[src]").each((_, el) => {
      const src = absolutize(url, $(el).attr("src"));
      const alt = ($(el).attr("alt") || "").toLowerCase();
      if (!src) return;
      if (/press|headshot|portrait|photo|profile|artist|musician|john\s*doe/i.test(alt) || /press|headshot|artist|profile|og-preview/i.test(src)) {
        if (!fp.pressImageUrls!.includes(src)) fp.pressImageUrls!.push(src);
      }
    });

    extractJsonLd($, url, fp, sameAsSet);
    $('a[rel~="me"]').each((_, el) => {
      const href = absolutize(url, $(el).attr("href"));
      if (href) pushLink(fp, href, url, "rel-me", 92, { linkRole: "self" });
    });

    $("a[href]").each((_, el) => {
      const href = absolutize(url, $(el).attr("href"));
      if (!href) return;
      const $el = $(el);
      const parent = $el.closest("footer, nav, header, [class*='social'], [id*='social']");
      const recParent = $el.closest(
        "[class*='recommendation'], [class*='collaborat'], [class*='credit'], [class*='featured']",
      );
      const parentClass = recParent.attr("class") || parent.attr("class") || "";
      const parentId = recParent.attr("id") || parent.attr("id") || "";
      const anchorText = $el.text().trim();
      const isRecommendation =
        recParent.length > 0 ||
        /recommendation|collaborat|predator\s*poach|featured\s+by/i.test(`${parentClass} ${parentId} ${anchorText}`);
      const isSocialNav = parent.is("footer, nav, header") || /social-icon|platform-logo/i.test(parentClass);

      let linkSource: ExtractedLink["source"] = "body";
      if (parent.is("footer") || (parent.length && /footer|social-icon|platform-logo/i.test(parentClass))) {
        linkSource = "footer";
      }

      const inSameAs = sameAsSet.has(href.split("#")[0]);
      pushLink(fp, href, url, linkSource, inSameAs ? 88 : 72, {
        linkRole: isRecommendation ? "collaborator" : inSameAs ? "self" : isSocialNav ? "associated" : undefined,
        contextHint: isRecommendation ? "recommendation" : isSocialNav ? "social-nav" : "content",
        inSchemaSameAs: inSameAs,
      });
      if (sameSite(href, origin) && depth < flags.maxCrawlDepth) {
        const path = new URL(href).pathname.toLowerCase();
        if (/about|bio|music|contact|link|social|press/.test(path)) {
          queue.push({ url: href, depth: depth + 1 });
        }
      }
    });

    enrichFromText(fp, $("body").text().replace(/\s+/g, " "));
  }

  fp.socialLinks = dedupeLinks(fp.socialLinks);
  fp.allExternalLinks = dedupeLinks(fp.allExternalLinks);
  fp.locationPhrases = [...new Set(fp.locationPhrases)];
  fp.professionPhrases = [...new Set(fp.professionPhrases)];
  fp.uniquePhrases = [...new Set(fp.uniquePhrases)];
  return fp;
}

export function expandQueriesFromFingerprint(fp: SiteFingerprint, name: string, location?: string): string[] {
  const q = new Set<string>();
  const loc = location || fp.locationPhrases[0] || "";

  for (const song of fp.songTitles) {
    q.add(`site:twitch.tv "${song}" ${name}`);
    q.add(`site:twitch.tv "${song}" musician`);
    q.add(`site:youtube.com "${song}" "${name}"`);
    q.add(`"${song}" "${name}" folk`);
    if (loc) q.add(`"${song}" ${loc}`);
  }
  for (const album of fp.albumTitles) {
    q.add(`"${album}" "${name}"`);
    q.add(`site:bandcamp.com "${name}" "${album}"`);
  }
  for (const phrase of fp.uniquePhrases.slice(0, 4)) {
    q.add(`"${phrase}" "${name}"`);
    if (/acme|example brand/i.test(phrase)) {
      q.add(`"${phrase}" site:x.com OR site:twitter.com`);
      q.add(`"${phrase}" "${name}" site:x.com`);
    }
  }
  for (const link of fp.socialLinks) {
    if (link.handle) q.add(`site:${new URL(link.url).hostname} ${link.handle}`);
  }
  q.add(`site:reverbnation.com "${name}"`);
  q.add(`site:twitch.tv "${name}" musician OR folk OR songwriter`);
  if (loc) q.add(`site:twitch.tv "${name}" ${loc}`);

  return [...q].slice(0, 24);
}

/** Rebuild crawl fingerprint from a stored report (refine path). */
export function rehydrateSiteFingerprint(report: OsintReport): SiteFingerprint | undefined {
  const sf = report.siteFingerprint;
  if (!sf) return undefined;
  const links = (report.domainIntel?.extractedLinks ?? []).map((l) => ({
    url: l.url,
    platform: l.platform,
    handle: l.handle,
    confidence: l.confidence,
    source: (l.source as ExtractedLink["source"]) || "body",
    pageUrl: `https://${sf.domain}/`,
    linkRole: (l.linkRole as ExtractedLink["linkRole"]) || undefined,
    contextHint: (l.contextHint as ExtractedLink["contextHint"]) || undefined,
  }));
  return {
    domain: sf.domain,
    title: sf.title,
    description: report.domainIntel?.siteDescription,
    locationPhrases: sf.locationPhrases,
    professionPhrases: [],
    uniquePhrases: sf.uniquePhrases,
    albumTitles: sf.albumTitles,
    songTitles: sf.songTitles,
    socialLinks: links.filter((l) => l.platform),
    allExternalLinks: links,
    pagesCrawled: [],
    robotsRespected: true,
    rawTextSample: report.domainIntel?.siteTextSample ?? "",
  };
}

export function probesFromSiteLinks(links: ExtractedLink[]): import("../types.js").UsernameProbe[] {
  const probes: import("../types.js").UsernameProbe[] = [];
  for (const link of links) {
    if (!link.platform || !link.handle) continue;
    probes.push({
      platform: link.platform,
      username: link.handle,
      url: link.url,
      exists: true,
      confidence: link.linkRole === "collaborator" ? Math.min(55, link.confidence) : Math.min(98, link.confidence + 5),
      method: "site-link",
      bio:
        link.linkRole === "collaborator"
          ? `Linked on subject site (${link.contextHint || link.source}) - associate/colleague; ownership unverified`
          : `Discovered via owned-site link (${link.source})`,
    });
  }
  return probes;
}