/**
 * Reverse-image search helpers (v6) - public endpoints / UI URLs only.
 * Playwright execution is optional; builders always work for operator handoff.
 */
export interface ReverseImageQuery {
  engine: "yandex" | "google-lens" | "tineye" | "bing-visual";
  pageUrl: string;
  method: "get-url" | "upload-ui";
  notes: string;
}

export interface ReverseImageHit {
  engine: string;
  title: string;
  url: string;
  snippet?: string;
  sourceImageUrl: string;
  collectedAt: string;
}

/** Build public reverse-image search page URLs for a remote image. */
export function buildReverseImageQueries(imageUrl: string): ReverseImageQuery[] {
  const enc = encodeURIComponent(imageUrl);
  return [
    {
      engine: "yandex",
      pageUrl: `https://yandex.com/images/search?rpt=imageview&url=${enc}`,
      method: "get-url",
      notes: "Yandex imageview - often best public RIS coverage; may rate-limit",
    },
    {
      engine: "google-lens",
      pageUrl: `https://lens.google.com/uploadbyurl?url=${enc}`,
      method: "get-url",
      notes: "Google Lens by URL - captcha risk; operator can open manually",
    },
    {
      engine: "bing-visual",
      pageUrl: `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlPaste&q=imgurl:${enc}`,
      method: "get-url",
      notes: "Bing visual search via imgurl parameter",
    },
    {
      engine: "tineye",
      pageUrl: `https://tineye.com/search?url=${enc}`,
      method: "get-url",
      notes: "TinEye public URL search - limited free results",
    },
  ];
}

/**
 * Lightweight HTML parse of Yandex results when fetch succeeds (no browser).
 * Returns empty on block/captcha - caller should fall back to manual queries.
 */
export async function tryFetchYandexReverseHits(
  imageUrl: string,
  limit = 8,
): Promise<ReverseImageHit[]> {
  const q = buildReverseImageQueries(imageUrl).find((x) => x.engine === "yandex");
  if (!q) return [];
  try {
    const res = await fetch(q.pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    if (/captcha|showcaptcha|robot/i.test(html)) return [];

    const hits: ReverseImageHit[] = [];
    const re = /href="(https?:\/\/[^"]+)"[^>]*>([^<]{10,120})/gi;
    let m: RegExpExecArray | null;
    const skip = /yandex\.|javascript:|captcha/i;
    while ((m = re.exec(html)) && hits.length < limit) {
      const url = m[1];
      const title = m[2].replace(/\s+/g, " ").trim();
      if (skip.test(url) || skip.test(title)) continue;
      if (hits.some((h) => h.url === url)) continue;
      hits.push({
        engine: "yandex",
        title,
        url,
        sourceImageUrl: imageUrl,
        collectedAt: new Date().toISOString(),
      });
    }
    return hits;
  } catch {
    return [];
  }
}

/** Aggregate RIS query pack for dossier / MCP. */
export function buildReverseImagePack(imageUrls: string[]): {
  queries: ReverseImageQuery[];
  sourceCount: number;
} {
  const queries: ReverseImageQuery[] = [];
  const seen = new Set<string>();
  for (const img of imageUrls.slice(0, 5)) {
    if (seen.has(img)) continue;
    seen.add(img);
    queries.push(...buildReverseImageQueries(img));
  }
  return { queries, sourceCount: seen.size };
}
