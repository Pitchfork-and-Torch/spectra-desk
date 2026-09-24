import * as cheerio from "cheerio";
import type { ExtractedLink } from "./website-profiler.js";

const UA = "SpectraDesk-OSINT/4.0";

export interface ArchiveSnapshot {
  timestamp: string;
  original: string;
  archiveUrl: string;
}

export async function listWaybackSnapshots(domain: string, limit = 8): Promise<ArchiveSnapshot[]> {
  const url = domain.startsWith("http") ? domain : `https://${domain}/`;
  try {
    const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}*&output=json&fl=timestamp,original&filter=statuscode:200&collapse=digest&limit=${limit}`;
    const res = await fetch(cdx, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return [];
    const rows = (await res.json()) as string[][];
    if (!rows.length) return [];
    const [, ...data] = rows;
    return data.map(([timestamp, original]) => ({
      timestamp,
      original,
      archiveUrl: `https://web.archive.org/web/${timestamp}/${original}`,
    }));
  } catch {
    return [];
  }
}

export async function extractLinksFromArchive(snapshotUrl: string): Promise<ExtractedLink[]> {
  const links: ExtractedLink[] = [];
  try {
    const res = await fetch(snapshotUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return links;
    const html = await res.text();
    const $ = cheerio.load(html);
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || !href.startsWith("http")) return;
      if (/twitch\.tv|steamcommunity|youtube\.com|spotify\.com|reverbnation/i.test(href)) {
        links.push({
          url: href,
          confidence: 78,
          source: "body",
          pageUrl: snapshotUrl,
          platform: href.includes("twitch") ? "Twitch" : href.includes("steam") ? "Steam" : undefined,
        });
      }
    });
  } catch {
    /* optional */
  }
  return links;
}

export async function timeloopDomain(domain: string): Promise<{
  snapshots: ArchiveSnapshot[];
  historicalLinks: ExtractedLink[];
}> {
  const snapshots = await listWaybackSnapshots(domain, 5);
  const historicalLinks: ExtractedLink[] = [];
  for (const snap of snapshots.slice(0, 2)) {
    const found = await extractLinksFromArchive(snap.archiveUrl);
    historicalLinks.push(...found);
  }
  return { snapshots, historicalLinks };
}