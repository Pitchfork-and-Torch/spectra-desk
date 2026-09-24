import type { WikipediaResult } from "../types.js";

export async function searchWikipedia(query: string, limit = 5): Promise<WikipediaResult[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&namespace=0&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": "SpectraDesk-OSINT/1.1 (research)" } });
    const data = (await res.json()) as [string, string[], string[], string[]];
    const titles = data[1] || [];
    const descriptions = data[2] || [];
    const urls = data[3] || [];
    return titles.map((title, i) => ({
      title,
      url: urls[i] || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      description: descriptions[i] || "",
    }));
  } catch {
    return [];
  }
}