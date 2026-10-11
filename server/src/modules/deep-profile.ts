/**
 * Deep Profile Extractor (v6)
 * Beyond HTTP existence: extract public bio, location, avatar, links via API or OG HTML.
 * Public sources only - no authenticated sessions.
 */
import * as cheerio from "cheerio";
import type { UsernameProbe } from "../types.js";
import { fetchGitHubProfile } from "./github.js";
import { sha256 } from "../hash.js";

const UA = "SpectraDesk-OSINT/6.0 (public research; +https://github.com/Pitchfork-and-Torch/spectra-desk)";

export interface DeepProfile {
  platform: string;
  username: string;
  url: string;
  exists: boolean;
  displayName?: string;
  bio?: string;
  locationText?: string;
  avatarUrl?: string;
  website?: string;
  joinDate?: string;
  followerCount?: number;
  recentActivity?: string[];
  outboundLinks?: string[];
  extractedAt: string;
  method: "api" | "og-html" | "json-ld" | "http-probe" | "none";
  contentHash?: string;
  enrichmentNotes?: string[];
}

function canonicalText(p: DeepProfile): string {
  return [p.displayName, p.bio, p.locationText, p.website, ...(p.outboundLinks || [])].filter(Boolean).join("\n");
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<{ ok: boolean; status: number; html: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html };
  } catch {
    return { ok: false, status: 0, html: "" };
  }
}

function extractOg(html: string, baseUrl: string): Partial<DeepProfile> {
  const $ = cheerio.load(html);
  const og = (prop: string) =>
    $(`meta[property="${prop}"]`).attr("content") || $(`meta[name="${prop}"]`).attr("content") || undefined;
  const title = og("og:title") || $("title").first().text().trim() || undefined;
  const desc = og("og:description") || og("description") || undefined;
  let image = og("og:image");
  if (image) {
    try {
      image = new URL(image, baseUrl).href;
    } catch {
      /* keep raw */
    }
  }
  const links: string[] = [];
  $('a[href^="http"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href && links.length < 12) links.push(href);
  });
  return {
    displayName: title?.slice(0, 120),
    bio: desc?.slice(0, 500),
    avatarUrl: image,
    outboundLinks: links,
    method: "og-html",
  };
}

/** Enrich a single username probe with public content when possible. */
export async function enrichDeepProfile(probe: UsernameProbe): Promise<DeepProfile> {
  const base: DeepProfile = {
    platform: probe.platform,
    username: probe.username,
    url: probe.url,
    exists: probe.exists,
    displayName: probe.displayName,
    bio: probe.bio,
    locationText: probe.location,
    website: probe.linkedUrl,
    extractedAt: new Date().toISOString(),
    method: probe.method === "api" ? "api" : "http-probe",
    enrichmentNotes: [],
  };

  if (!probe.exists) {
    base.method = "none";
    return base;
  }

  // GitHub REST - strongest public API
  if (probe.platform === "GitHub") {
    const gh = await fetchGitHubProfile(probe.username);
    if (gh) {
      base.exists = true;
      base.displayName = gh.name || base.displayName;
      base.bio = gh.bio || base.bio;
      base.locationText = gh.location || base.locationText;
      base.website = gh.blog || base.website;
      base.avatarUrl = gh.avatarUrl;
      base.method = "api";
      base.followerCount = gh.followers;
      base.enrichmentNotes = ["GitHub REST API profile"];
    }
  }

  // Reddit about.json
  if (probe.platform === "Reddit") {
    try {
      const res = await fetch(`https://www.reddit.com/user/${encodeURIComponent(probe.username)}/about.json`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: Record<string, unknown> };
        const d = data.data;
        if (d && !d.is_suspended) {
          base.exists = true;
          base.displayName = d.subreddit ? String((d.subreddit as { title?: string }).title || d.name) : String(d.name || probe.username);
          base.bio = d.subreddit ? String((d.subreddit as { public_description?: string }).public_description || "") : undefined;
          base.avatarUrl = d.icon_img ? String(d.icon_img).split("?")[0] : undefined;
          base.method = "api";
          base.enrichmentNotes = ["Reddit public about.json"];
        }
      }
    } catch {
      base.enrichmentNotes = [...(base.enrichmentNotes || []), "Reddit API failed"];
    }
  }

  // Generic OG HTML for major social hosts (public pages only)
  const ogPlatforms = /Instagram|TikTok|Twitter\/X|YouTube|Pinterest|Behance|WordPress|Steam|Twitch/i;
  if (ogPlatforms.test(probe.platform) || base.method === "http-probe") {
    const page = await fetchText(probe.url);
    if (page.ok && page.html.length > 200) {
      // Soft 404 / login walls
      if (/page not found|user not found|content isn't available|login to continue|sign in/i.test(page.html) && page.html.length < 50_000) {
        base.enrichmentNotes = [...(base.enrichmentNotes || []), `Possible soft-404/login wall (HTTP ${page.status})`];
      }
      const og = extractOg(page.html, probe.url);
      if (og.displayName && !base.displayName) base.displayName = og.displayName;
      if (og.bio) base.bio = og.bio;
      if (og.avatarUrl) base.avatarUrl = og.avatarUrl;
      if (og.outboundLinks?.length) base.outboundLinks = og.outboundLinks;
      if (base.method === "http-probe" && (og.bio || og.avatarUrl)) base.method = "og-html";
      base.enrichmentNotes = [...(base.enrichmentNotes || []), "Open Graph / HTML public scrape"];
    } else if (!page.ok) {
      base.enrichmentNotes = [...(base.enrichmentNotes || []), `HTML fetch failed (${page.status})`];
    }
  }

  const text = canonicalText(base);
  if (text.trim()) base.contentHash = sha256(text);
  return base;
}

/** Enrich top-N live probes (parallel, bounded). */
export async function enrichDeepProfiles(
  probes: UsernameProbe[],
  opts?: { limit?: number; concurrency?: number },
): Promise<DeepProfile[]> {
  const limit = opts?.limit ?? 12;
  const concurrency = opts?.concurrency ?? 4;
  const live = probes.filter((p) => p.exists).slice(0, limit);
  const results: DeepProfile[] = [];

  for (let i = 0; i < live.length; i += concurrency) {
    const batch = live.slice(i, i + concurrency);
    const part = await Promise.all(batch.map((p) => enrichDeepProfile(p)));
    results.push(...part);
  }
  return results;
}

/** True if profile has usable content for attribution (not mere existence). */
export function deepProfileHasContent(p: DeepProfile): boolean {
  return Boolean(
    (p.bio && p.bio.length > 8) ||
      (p.locationText && p.locationText.length > 2) ||
      (p.displayName && p.displayName.length > 2 && !/^page not found/i.test(p.displayName)) ||
      (p.avatarUrl && !/default|logo|yt_1200/i.test(p.avatarUrl)),
  );
}
