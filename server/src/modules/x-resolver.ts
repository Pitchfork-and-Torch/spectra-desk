import type { SubjectInput, UsernameProbe } from "../types.js";
import { fullName } from "./subject.js";
import { deriveUsernames } from "./subject.js";
import { nameMatchesInText } from "./name-variants.js";
import type { SiteFingerprint } from "./website-profiler.js";
import {
  displayNameMatchesBrand,
  hasBrandAnchor,
  isGenericXHomonymHandle,
} from "./homonym-exclusions.js";

const UA = "Mozilla/5.0 (compatible; SpectraDesk-OSINT/4.3; +https://github.com/Pitchfork-and-Torch/spectra-desk)";

export interface XProfileMeta {
  handle: string;
  displayName: string;
  url: string;
}

export function parseXProfileImage(html: string): string | null {
  const patterns = [
    /property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+property=["']og:image["']/i,
    /name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
    /"profile_image_url_https"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      return m[1].replace(/\\u002F/g, "/").replace(/&amp;/g, "&");
    }
  }
  return null;
}

export function parseXProfileTitle(html: string, requestedHandle: string): XProfileMeta | null {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!titleMatch) return null;
  const title = titleMatch[1]
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

  // Example: Brand Name (@JohnDoeOfficial) / X
  const m = title.match(/^(.+?)\s*\(@([A-Za-z0-9_]{1,15})\)\s*\/\s*X/i);
  if (m) {
    return {
      displayName: m[1].replace(/\s*[ - - -]\s*$/, "").trim(),
      handle: m[2],
      url: `https://x.com/${m[2]}`,
    };
  }

  if (/posts by/i.test(title)) {
    const h = title.match(/Posts by\s+([A-Za-z0-9_]+)/i);
    if (h) {
      return {
        displayName: h[1],
        handle: requestedHandle,
        url: `https://x.com/${requestedHandle}`,
      };
    }
  }
  return null;
}

export async function resolveXProfile(handle: string): Promise<XProfileMeta | null> {
  const clean = handle.replace(/^@/, "").trim();
  if (!clean || clean.length > 15) return null;
  try {
    const res = await fetch(`https://x.com/${encodeURIComponent(clean)}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseXProfileTitle(html, clean);
  } catch {
    return null;
  }
}

/** Brand- and site-derived X handle candidates from username anchor and social links. */
export function generateXHandleCandidates(subject: SubjectInput, siteFp?: SiteFingerprint): string[] {
  const out = new Set<string>();

  if (subject.username && hasBrandAnchor(subject)) {
    out.add(subject.username.replace(/-/g, ""));
    for (const part of subject.username.split(/[-_]/)) {
      if (part.length >= 3) out.add(part);
    }
    const f = subject.firstName?.toLowerCase().replace(/[^a-z]/g, "") || "";
    if (f) {
      out.add(`${f}official`);
      out.add(`${f}_official`);
    }
  }

  if (!hasBrandAnchor(subject)) {
    for (const u of deriveUsernames(subject)) out.add(u);
  }

  for (const link of siteFp?.socialLinks || []) {
    if (link.handle && /twitch|tiktok|youtube/i.test(link.platform || "")) {
      out.add(link.handle.replace(/^@/, ""));
    }
  }

  for (const phrase of siteFp?.uniquePhrases || []) {
    const compact = phrase.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (compact.length >= 6 && compact.length <= 15) out.add(compact.slice(0, 15));
  }

  return [...out]
    .map((h) => h.replace(/^@/, "").trim())
    .filter((h) => h.length >= 3 && h.length <= 15 && /^[A-Za-z0-9_]+$/.test(h))
    .filter((h) => !(hasBrandAnchor(subject) && isGenericXHomonymHandle(h, subject)))
    .slice(0, 8);
}

function brandPhraseMatch(displayName: string, siteFp?: SiteFingerprint, subject?: SubjectInput): number {
  let score = 0;
  if (subject && displayNameMatchesBrand(displayName, subject)) score += 0.55;
  if (subject && nameMatchesInText(subject.firstName, subject.lastName, displayName) >= 0.85) score += 0.5;
  for (const phrase of siteFp?.uniquePhrases || []) {
    const p = phrase.toLowerCase().replace(/[^a-z0-9\s&]/g, " ").trim();
    if (p.length > 4 && displayName.toLowerCase().includes(p.replace(/\s+/g, "").slice(0, 12))) score += 0.4;
  }
  if (subject?.username && displayName.toLowerCase().includes(subject.username.toLowerCase().replace(/-/g, ""))) {
    score += 0.35;
  }
  return Math.min(1, score);
}

export async function discoverXAccounts(
  subject: SubjectInput,
  siteFp?: SiteFingerprint,
): Promise<UsernameProbe[]> {
  const probes: UsernameProbe[] = [];
  const candidates = generateXHandleCandidates(subject, siteFp);
  const name = fullName(subject);

  const metas = await Promise.all(candidates.map((handle) => resolveXProfile(handle)));
  for (let i = 0; i < candidates.length; i++) {
    const meta = metas[i];
    if (!meta) continue;
    if (hasBrandAnchor(subject) && isGenericXHomonymHandle(meta.handle, subject)) continue;

    const brandScore = brandPhraseMatch(meta.displayName, siteFp, subject);
    const nameScore = name ? nameMatchesInText(subject.firstName, subject.lastName, meta.displayName) : 0;
    const confidence = Math.round(55 + brandScore * 30 + nameScore * 15);

    probes.push({
      platform: "Twitter/X",
      username: meta.handle,
      url: meta.url,
      exists: true,
      displayName: meta.displayName,
      bio: `X profile resolved via public page title`,
      confidence: Math.min(96, confidence),
      method: "platform-resolver",
    });
  }

  const dedup = new Map<string, UsernameProbe>();
  for (const p of probes) dedup.set(p.username.toLowerCase(), p);
  return [...dedup.values()].sort((a, b) => b.confidence - a.confidence);
}