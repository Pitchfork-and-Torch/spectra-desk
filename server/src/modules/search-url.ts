/**
 * Normalize search-engine tracking redirects into the destination URL.
 * Bing often returns `bing.com/ck/a?...&u=a1BASE64` instead of the real link.
 */

function decodeBase64Url(payload: string): string | null {
  try {
    let s = payload.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const decoded = Buffer.from(s, "base64").toString("utf8");
    if (/^https?:\/\//i.test(decoded)) return decoded;
    // Some Bing payloads prefix with a1/a0 before the base64 body
    return null;
  } catch {
    return null;
  }
}

/** Decode Bing `u=` parameter (often `a1` + base64 of the destination). */
export function decodeBingUParam(u: string): string | null {
  if (!u) return null;
  const raw = u.trim();
  // Common form: a1aHR0cHM6Ly...
  if (/^a\d/i.test(raw)) {
    const decoded = decodeBase64Url(raw.slice(2));
    if (decoded) return decoded;
  }
  const direct = decodeBase64Url(raw);
  if (direct) return direct;
  try {
    const asText = decodeURIComponent(raw);
    if (/^https?:\/\//i.test(asText)) return asText;
  } catch {
    /* ignore */
  }
  return null;
}

/** Unwrap Bing / Google / DDG redirect wrappers to the destination URL. */
export function unwrapSearchUrl(input: string): string {
  if (!input || !/^https?:\/\//i.test(input)) return input;
  try {
    const u = new URL(input);

    // Bing click tracking
    if (/(?:^|\.)bing\.com$/i.test(u.hostname) && (u.pathname.startsWith("/ck/") || u.searchParams.has("u"))) {
      const rawU = u.searchParams.get("u");
      if (rawU) {
        const dest = decodeBingUParam(rawU);
        if (dest) return unwrapSearchUrl(dest);
      }
    }

    // Google redirect
    if (/(?:^|\.)google\./i.test(u.hostname) && (u.pathname === "/url" || u.pathname === "/search")) {
      const q = u.searchParams.get("q") || u.searchParams.get("url");
      if (q && /^https?:\/\//i.test(q)) return unwrapSearchUrl(q);
    }

    // DuckDuckGo redirect
    if (/(?:^|\.)duckduckgo\.com$/i.test(u.hostname) && u.pathname === "/l/") {
      const uddg = u.searchParams.get("uddg");
      if (uddg && /^https?:\/\//i.test(uddg)) return unwrapSearchUrl(uddg);
    }

    return input;
  } catch {
    return input;
  }
}

/** Map hit URLs through unwrap (immutable). */
export function normalizeSearchHitUrl<T extends { url: string }>(hit: T): T {
  return { ...hit, url: unwrapSearchUrl(hit.url) };
}
