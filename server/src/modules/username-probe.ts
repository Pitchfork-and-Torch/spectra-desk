import type { UsernameProbe } from "../types.js";
import { fetchGitHubProfile } from "./github.js";
import { SHERLOCK_SITES } from "./sherlock-sites.js";

const UA = "SpectraDesk-OSINT/5.0";
const PROBE_BATCH = 10;

async function probeJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function probeHead(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
    if (res.status === 404 || res.status === 410) return false;
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function probeSherlockBatch(username: string, sites: typeof SHERLOCK_SITES): Promise<UsernameProbe[]> {
  const probes: UsernameProbe[] = [];
  for (let i = 0; i < sites.length; i += PROBE_BATCH) {
    const batch = sites.slice(i, i + PROBE_BATCH);
    await Promise.all(
      batch.map(async (site) => {
        const url = site.url(username);
        const ok = await probeHead(url);
        if (ok) {
          probes.push({ platform: site.platform, username, url, exists: true, confidence: 65, method: "http-probe" });
        }
      }),
    );
  }
  return probes;
}

export async function probeUsername(username: string): Promise<UsernameProbe[]> {
  const probes: UsernameProbe[] = [];
  const u = encodeURIComponent(username);

  const gh = await fetchGitHubProfile(username);
  if (gh) {
    probes.push({
      platform: "GitHub",
      username,
      url: gh.url,
      exists: true,
      displayName: gh.name || undefined,
      bio: gh.bio || undefined,
      linkedUrl: gh.blog || undefined,
      location: gh.location || undefined,
      confidence: 95,
      method: "api",
    });
  } else {
    probes.push({ platform: "GitHub", username, url: `https://github.com/${username}`, exists: false, confidence: 10, method: "api" });
  }

  const reddit = await probeJson(`https://www.reddit.com/user/${u}/about.json`);
  const redditData = reddit?.data as Record<string, unknown> | undefined;
  if (redditData && !redditData.is_suspended) {
    probes.push({
      platform: "Reddit",
      username,
      url: `https://www.reddit.com/user/${username}`,
      exists: true,
      displayName: redditData.name ? String(redditData.name) : username,
      confidence: 88,
      method: "api",
    });
  } else {
    probes.push({ platform: "Reddit", username, url: `https://www.reddit.com/user/${username}`, exists: false, confidence: 12, method: "api" });
  }

  const hn = await probeJson(`https://hacker-news.firebaseio.com/v0/user/${username}.json`);
  if (hn && typeof hn === "object") {
    probes.push({
      platform: "Hacker News",
      username,
      url: `https://news.ycombinator.com/user?id=${username}`,
      exists: true,
      displayName: hn.about ? String(hn.about).slice(0, 80) : undefined,
      confidence: 85,
      method: "api",
    });
  }

  const keybase = await probeJson(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${u}`);
  const kbUser = (keybase?.them as Array<Record<string, unknown>>)?.[0];
  if (kbUser?.basics) {
    const basics = kbUser.basics as Record<string, unknown>;
    probes.push({
      platform: "Keybase",
      username,
      url: `https://keybase.io/${username}`,
      exists: true,
      displayName: basics.full_name ? String(basics.full_name) : undefined,
      bio: basics.bio ? String(basics.bio) : undefined,
      location: basics.location ? String(basics.location) : undefined,
      confidence: 92,
      method: "api",
    });
  }

  const devto = await probeJson(`https://dev.to/api/users/by_username?url=${username}`);
  if (devto?.id) {
    probes.push({
      platform: "Dev.to",
      username,
      url: `https://dev.to/${username}`,
      exists: true,
      displayName: devto.name ? String(devto.name) : undefined,
      bio: devto.summary ? String(devto.summary) : undefined,
      linkedUrl: devto.website_url ? String(devto.website_url) : undefined,
      confidence: 86,
      method: "api",
    });
  }

  probes.push(...(await probeSherlockBatch(username, SHERLOCK_SITES)));

  const deduped = new Map<string, UsernameProbe>();
  for (const p of probes) {
    const key = `${p.platform}:${p.username.toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || (p.exists && !existing.exists) || (p.exists && p.confidence > existing.confidence)) {
      deduped.set(key, p);
    }
  }

  return [...deduped.values()].sort((a, b) => (b.exists ? b.confidence : 0) - (a.exists ? a.confidence : 0));
}