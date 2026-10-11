import type { UsernameProbe } from "../types.js";
import type { SiteFingerprint } from "./website-profiler.js";
import { contentSimilarity } from "./content-fingerprint.js";

const UA = "SpectraDesk-OSINT/4.0";

export function parseTwitchHandle(url: string): string | null {
  const m = url.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i);
  return m?.[1] || null;
}

export async function resolveTwitchChannel(
  handle: string,
  siteFp?: SiteFingerprint,
): Promise<UsernameProbe | null> {
  const url = `https://www.twitch.tv/${handle}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const title = html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1];
    const description = html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1];
    const text = [title, description, html.slice(0, 12000)].filter(Boolean).join(" ");

    let confidence = 55;
    let sim = 0;
    if (siteFp?.rawTextSample) {
      sim = contentSimilarity(siteFp.rawTextSample, text);
      confidence += Math.floor(sim * 40);
    }
    if (/niagara/i.test(text) && siteFp?.songTitles.some((s) => /niagara/i.test(s))) confidence += 25;
    if (/john\s*doe|folk|songwriter|springfield/i.test(text)) confidence += 12;

    return {
      platform: "Twitch",
      username: handle,
      url,
      exists: true,
      displayName: title?.replace(/ - Twitch$/, ""),
      bio: description,
      confidence: Math.min(98, confidence),
      method: "platform-resolver" as UsernameProbe["method"],
    };
  } catch {
    return null;
  }
}

/** Discover Twitch handles via content pivots when username differs from anchor */
export async function discoverTwitchFromContent(
  siteFp: SiteFingerprint,
  knownHandles: Set<string>,
): Promise<UsernameProbe[]> {
  const probes: UsernameProbe[] = [];
  const seeds = [
    ...siteFp.songTitles.map((s) => `site:twitch.tv "${s}"`),
    `site:twitch.tv "Springfield" folk`,
  ];

  for (const q of seeds.slice(0, 3)) {
    try {
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) },
      );
      if (!res.ok) continue;
      const html = await res.text();
      const matches = html.matchAll(/twitch\.tv\/([A-Za-z0-9_]{3,25})/gi);
      for (const m of matches) {
        const handle = m[1];
        if (knownHandles.has(handle.toLowerCase())) continue;
        knownHandles.add(handle.toLowerCase());
        const probe = await resolveTwitchChannel(handle, siteFp);
        if (probe && probe.confidence >= 60) probes.push(probe);
      }
    } catch {
      continue;
    }
  }
  return probes;
}