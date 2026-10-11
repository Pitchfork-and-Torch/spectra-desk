import type { Browser, BrowserContext, Page } from "playwright";
import { getCachedSearch, setCachedSearch } from "./modules/search-cache.js";
import { log } from "./lib/logger.js";
import { launchChromium } from "./lib/playwright-launch.js";
import {
  globalSearchBreaker,
  searchDuckDuckGoInstant,
  searchHttpStack,
  type SearchHitLite,
} from "./modules/search-resilience.js";

let browser: Browser | null = null;
let sharedContext: BrowserContext | null = null;

const CAPTCHA_PATTERNS = /captcha|challenge|verify you are human|unusual traffic|rate.?limit|access denied/i;
const MAX_RETRIES = 2;

const BROWSER_ENGINES: Array<{ id: string; build: (q: string) => string }> = [
  { id: "brave", build: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  { id: "bing", build: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: "google", build: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&num=12&hl=en` },
  { id: "ddg-lite", build: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}` },
  { id: "ddg-html", build: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}` },
];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await launchChromium({
      args: ["--incognito", "--disable-blink-features=AutomationControlled"],
    });
  }
  return browser;
}

export async function getSharedContext(): Promise<BrowserContext> {
  const b = await ensureBrowser();
  if (!sharedContext) {
    sharedContext = await b.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
    });
  }
  return sharedContext;
}

export async function getPage(): Promise<Page> {
  const context = await getSharedContext();
  return context.newPage();
}

async function detectBlock(page: Page): Promise<string | null> {
  try {
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? "");
    if (CAPTCHA_PATTERNS.test(body)) return "captcha-or-block";
    const title = await page.title();
    if (CAPTCHA_PATTERNS.test(title)) return "captcha-or-block";
  } catch {
    /* ignore */
  }
  return null;
}

function parseResultsFromPage(limit: number): (max: number) => Array<{ title: string; url: string; snippet: string }> {
  return (max) => {
    const items: Array<{ title: string; url: string; snippet: string }> = [];
    const selectors = [
      "a.result-header",
      ".result__a",
      ".result-link",
      ".snippet-title",
      "article a[href^='http']",
      "table.result-link a[href^='http']",
      "a[href^='http']",
    ];
    for (const sel of selectors) {
      const links = document.querySelectorAll(sel);
      for (const link of links) {
        if (items.length >= max) break;
        const a = link as HTMLAnchorElement;
        const href = a.href;
        if (/brave\.com|duckduckgo\.com|google\.com\/search|bing\.com\/search|microsoft\.com\/bing/i.test(href)) continue;
        const title = a.textContent?.trim() || "";
        if (title.length < 4) continue;
        if (items.some((i) => i.url === href)) continue;
        const parent = a.closest("div, article, li, tr");
        const snippet = parent?.textContent?.replace(title, "").trim().slice(0, 200) || "";
        items.push({ title, url: href, snippet });
      }
      if (items.length > 0) break;
    }
    return items;
  };
}

async function searchViaHttpFallback(query: string, limit: number): Promise<SearchHitLite[]> {
  const hits = await searchDuckDuckGoInstant(query, limit);
  if (hits.length) {
    log.info("browser", "HTTP search fallback succeeded", { query, count: hits.length });
  }
  return hits;
}

export async function searchWeb(page: Page, query: string, limit: number) {
  const cached = getCachedSearch(query);
  if (cached?.length) {
    log.debug("browser", "Cache hit", { query });
    return cached.slice(0, limit);
  }

  const httpFirst = await searchHttpStack(query, limit);
  if (httpFirst.length >= Math.min(2, limit)) {
    setCachedSearch(query, httpFirst);
    log.debug("browser", "HTTP stack search success", { query, count: httpFirst.length });
    return httpFirst;
  }

  for (const engine of BROWSER_ENGINES) {
    if (globalSearchBreaker.isOpen(engine.id)) {
      log.debug("browser", "Engine circuit open", { engine: engine.id });
      continue;
    }

    const url = engine.build(query);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) await sleep(1200 * 2 ** attempt);
        const timeout = engine.id.startsWith("ddg") ? 18_000 : 22_000;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
        await page.waitForTimeout(600 + attempt * 150);

        const block = await detectBlock(page);
        if (block) {
          globalSearchBreaker.recordFailure(engine.id);
          log.warn("browser", "Search blocked", { query, engine: engine.id, attempt, block });
          break;
        }

        const results = await page.evaluate(parseResultsFromPage(limit), limit);

        if (results.length > 0) {
          globalSearchBreaker.recordSuccess(engine.id);
          setCachedSearch(query, results);
          log.debug("browser", "Search success", { query, engine: engine.id, count: results.length });
          return results;
        }
      } catch (err) {
        globalSearchBreaker.recordFailure(engine.id);
        log.warn("browser", "Search attempt failed", {
          query,
          engine: engine.id,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const fallback = await searchViaHttpFallback(query, limit);
  if (fallback.length) {
    setCachedSearch(query, fallback);
    return fallback;
  }

  return [];
}

export interface SearchBatchOptions {
  concurrency?: number;
  onQuery?: (query: string, index: number, total: number) => void;
  shouldStop?: (processed: number, results: Map<string, SearchHitLite[]>) => boolean;
}

export async function searchWebBatch(
  queries: string[],
  limit: number,
  concurrency = 3,
  onQuery?: (query: string, index: number, total: number) => void,
  shouldStop?: (processed: number, results: Map<string, SearchHitLite[]>) => boolean,
): Promise<Map<string, SearchHitLite[]>> {
  const out = new Map<string, SearchHitLite[]>();
  const httpOnly = process.env.SPECTRA_HTTP_SEARCH_ONLY === "1";

  if (httpOnly) {
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]!;
      onQuery?.(query, i, queries.length);
      const cached = getCachedSearch(query);
      if (cached?.length) {
        out.set(query, cached.slice(0, limit));
        continue;
      }
      const hits = await searchHttpStack(query, limit);
      if (hits.length) setCachedSearch(query, hits);
      out.set(query, hits);
      if (shouldStop?.(i + 1, out)) break;
    }
    return out;
  }

  const context = await getSharedContext();
  let dynamicConcurrency = concurrency;

  for (let i = 0; i < queries.length; i += dynamicConcurrency) {
    if (shouldStop?.(i, out)) {
      log.info("browser", "Early-stopping search batch (degraded + anchor signal)", { processed: i, total: queries.length });
      break;
    }

    const batch = queries.slice(i, i + dynamicConcurrency);
    await Promise.all(
      batch.map(async (query, batchIdx) => {
        const idx = i + batchIdx;
        onQuery?.(query, idx, queries.length);
        const cached = getCachedSearch(query);
        if (cached?.length) {
          out.set(query, cached.slice(0, limit));
          return;
        }
        const page = await context.newPage();
        try {
          const hits = await searchWeb(page, query, limit);
          out.set(query, hits);
        } catch {
          const httpHits = await searchViaHttpFallback(query, limit);
          out.set(query, httpHits);
        } finally {
          await page.close();
        }
      }),
    );

    let emptyStreak = 0;
    for (const [, hits] of out) {
      if (!hits.length) emptyStreak++;
    }
    if (emptyStreak >= 3 && dynamicConcurrency > 1) {
      dynamicConcurrency = 1;
      log.info("browser", "Reduced search concurrency after blocks", { concurrency: dynamicConcurrency });
    }

    if (i + dynamicConcurrency < queries.length) await sleep(500);
  }
  return out;
}

export async function capturePage(page: Page, url: string) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) await sleep(1000 * 2 ** attempt);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const block = await detectBlock(page);
      if (block) throw new Error(block);
      const title = await page.title();
      const text = await page.evaluate(() => document.body?.innerText?.slice(0, 6000) ?? "");
      return { title, url: page.url(), text };
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
      log.warn("browser", "Capture retry", { url, attempt });
    }
  }
  return { title: url, url, text: "" };
}

export async function closeBrowser() {
  await sharedContext?.close();
  sharedContext = null;
  await browser?.close();
  browser = null;
}