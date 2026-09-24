import * as cheerio from "cheerio";
import type { SearchHitLite } from "./search-resilience.js";
import { unwrapSearchUrl } from "./search-url.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Bing HTML via fetch - supplemental when DDG is blocked. */
export async function searchBingHtml(query: string, limit: number): Promise<SearchHitLite[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const hits: SearchHitLite[] = [];
    $("li.b_algo").each((_, el) => {
      if (hits.length >= limit) return false;
      const a = $(el).find("h2 a").first();
      const title = a.text().trim();
      const href = unwrapSearchUrl(a.attr("href") || "");
      if (!title || !href.startsWith("http")) return;
      // Skip residual tracking wrappers
      if (/bing\.com\/ck\//i.test(href)) return;
      const snippet = $(el).find(".b_caption p").text().trim().slice(0, 240);
      hits.push({ title, url: href, snippet, source: "bing-html-fetch" });
    });
    return hits;
  } catch {
    return [];
  }
}

/** Optional Firecrawl search when FIRECRAWL_API_KEY is set (high-quality LE fallback). */
export async function searchFirecrawl(query: string, limit: number): Promise<SearchHitLite[]> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      success?: boolean;
      data?: Array<{ url?: string; title?: string; description?: string }>;
    };
    if (!data.success || !data.data?.length) return [];
    return data.data
      .filter((r) => r.url && r.title)
      .slice(0, limit)
      .map((r) => ({
        title: r.title!.slice(0, 120),
        url: r.url!,
        snippet: (r.description || "").slice(0, 240),
        source: "firecrawl-api",
      }));
  } catch {
    return [];
  }
}