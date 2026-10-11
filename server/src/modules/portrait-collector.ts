import type { EmailIntel, GitHubIntel, SearchHit, SubjectInput, UsernameProbe } from "../types.js";
import { builtinWrongIdentities } from "./homonym-exclusions.js";
import type { SiteFingerprint } from "./website-profiler.js";
import { parseXProfileImage } from "./x-resolver.js";

export interface PortraitSource {
  id: string;
  platform: string;
  label: string;
  profileUrl?: string;
  imageUrl: string;
  role: "anchor" | "subject-account" | "homonym" | "corroborating";
  handle?: string;
  priority: number;
}

const UNAVATAR_PLATFORM: Record<string, string> = {
  "Twitter/X": "x",
  GitHub: "github",
  YouTube: "youtube",
  Instagram: "instagram",
  Twitch: "twitch",
  TikTok: "tiktok",
  Facebook: "facebook",
};

function absolutizeImageUrl(base: string, href?: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

export function unavatarUrl(platform: string, handle: string): string | null {
  const slug = UNAVATAR_PLATFORM[platform];
  if (!slug || !handle) return null;
  const clean = handle.replace(/^@/, "").trim();
  if (!clean) return null;
  return `https://unavatar.io/${slug}/${encodeURIComponent(clean)}`;
}

export function collectPortraitSourceUrls(
  subject: SubjectInput,
  opts: {
    siteFp?: SiteFingerprint;
    githubIntel?: GitHubIntel;
    emailIntel?: EmailIntel;
    usernameProbes?: UsernameProbe[];
    domainUrl?: string;
  },
): PortraitSource[] {
  const sources: PortraitSource[] = [];
  const seen = new Set<string>();

  const push = (src: Omit<PortraitSource, "id">) => {
    const key = src.imageUrl.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({ ...src, id: `portrait-src-${sources.length + 1}` });
  };

  const origin = opts.siteFp?.domain ? `https://${opts.siteFp.domain}` : opts.domainUrl || "";

  if (opts.siteFp?.ogImageUrl) {
    const img = absolutizeImageUrl(origin, opts.siteFp.ogImageUrl);
    if (img) {
      push({
        platform: "Website",
        label: `${opts.siteFp.domain} - og:image`,
        profileUrl: origin,
        imageUrl: img,
        role: "anchor",
        priority: 100,
      });
    }
  }

  for (const press of opts.siteFp?.pressImageUrls || []) {
    const img = absolutizeImageUrl(origin, press);
    if (img) {
      push({
        platform: "Website",
        label: `${opts.siteFp!.domain} - press photo`,
        profileUrl: origin,
        imageUrl: img,
        role: "anchor",
        priority: 95,
      });
    }
  }

  if (opts.githubIntel?.avatarUrl) {
    push({
      platform: "GitHub",
      label: `@${opts.githubIntel.login}`,
      profileUrl: opts.githubIntel.url,
      imageUrl: opts.githubIntel.avatarUrl,
      role: "subject-account",
      handle: opts.githubIntel.login,
      priority: 88,
    });
  }

  if (opts.emailIntel?.gravatarExists && opts.emailIntel.gravatarUrl) {
    push({
      platform: "Gravatar",
      label: opts.emailIntel.email,
      imageUrl: opts.emailIntel.gravatarUrl.replace(/\?d=404$/, ""),
      role: "corroborating",
      priority: 75,
    });
  }

  for (const probe of opts.usernameProbes || []) {
    if (!probe.exists) continue;
    const unav = unavatarUrl(probe.platform, probe.username);
    if (unav) {
      const isHomonym = probe.bio?.includes("homonym") || probe.bio?.includes("associate/colleague");
      push({
        platform: probe.platform,
        label: probe.displayName ? `${probe.displayName} (@${probe.username})` : `@${probe.username}`,
        profileUrl: probe.url,
        imageUrl: unav,
        role: isHomonym ? "homonym" : "subject-account",
        handle: probe.username,
        priority: probe.method === "platform-resolver" ? 92 : 80,
      });
    }
  }

  for (const wrong of builtinWrongIdentities(subject)) {
    const m = wrong.url.match(/x\.com\/([^/?#]+)/i);
    if (!m) continue;
    const handle = m[1];
    const unav = unavatarUrl("Twitter/X", handle);
    if (unav) {
      push({
        platform: "Twitter/X",
        label: wrong.label,
        profileUrl: wrong.url,
        imageUrl: unav,
        role: "homonym",
        handle,
        priority: 70,
      });
    }
  }

  return sources.sort((a, b) => b.priority - a.priority);
}

function extractOgImage(html: string): string | null {
  const m =
    html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  return m?.[1] || null;
}

/** Pull portrait candidates from dork/search result pages (og:image). */
export async function enrichSourcesFromSearchHits(
  sources: PortraitSource[],
  hits: SearchHit[],
  limit = 6,
): Promise<PortraitSource[]> {
  const out = [...sources];
  const seen = new Set(out.map((s) => s.imageUrl.split("?")[0].toLowerCase()));
  const prioritized = [
    ...hits.filter((h) => h.classification === "corroborated"),
    ...hits.filter((h) => h.classification === "possible"),
    ...hits.filter((h) => !h.classification),
  ];

  for (const hit of prioritized.slice(0, limit)) {
    if (!hit.url || /youtube\.com\/watch|google\.com\/search/i.test(hit.url)) continue;
    try {
      const res = await fetch(hit.url.split("#")[0], {
        headers: { "User-Agent": "SpectraDesk-OSINT/4.4", Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const og = extractOgImage(await res.text());
      if (!og) continue;
      const key = og.split("?")[0].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `portrait-search-${out.length + 1}`,
        platform: "Web search",
        label: hit.title.slice(0, 80) || hit.url,
        profileUrl: hit.url,
        imageUrl: og,
        role: "corroborating",
        priority: hit.classification === "corroborated" ? 78 : 65,
      });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}

export async function enrichSourcesWithXOgImage(sources: PortraitSource[]): Promise<PortraitSource[]> {
  const out = [...sources];
  const xSources = sources.filter((s) => s.platform === "Twitter/X" && s.profileUrl && s.role !== "anchor");
  for (const src of xSources.slice(0, 6)) {
    try {
      const res = await fetch(src.profileUrl!, {
        headers: { "User-Agent": "SpectraDesk-OSINT/4.3", Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const og = parseXProfileImage(await res.text());
      if (og && !out.some((s) => s.imageUrl === og)) {
        out.push({
          ...src,
          id: `${src.id}-og`,
          imageUrl: og,
          label: `${src.label} (og:image)`,
          priority: src.priority + 5,
        });
      }
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}