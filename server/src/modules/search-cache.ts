import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.env.USERPROFILE || process.env.HOME || ".", ".spectra-desk", "search-cache");
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  cachedAt: string;
}

function cachePath(query: string): string {
  const hash = createHash("sha256").update(query).digest("hex").slice(0, 16);
  return path.join(CACHE_DIR, `${hash}.json`);
}

export function getCachedSearch(query: string): CacheEntry["results"] | null {
  try {
    const p = cachePath(query);
    if (!existsSync(p)) return null;
    const entry = JSON.parse(readFileSync(p, "utf8")) as CacheEntry;
    if (Date.now() - new Date(entry.cachedAt).getTime() > TTL_MS) return null;
    return entry.results;
  } catch {
    return null;
  }
}

export function setCachedSearch(query: string, results: CacheEntry["results"]): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      cachePath(query),
      JSON.stringify({ query, results, cachedAt: new Date().toISOString() } satisfies CacheEntry, null, 2),
      "utf8",
    );
  } catch {
    /* cache optional */
  }
}