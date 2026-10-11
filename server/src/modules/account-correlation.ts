import type { AccountCorrelation, GitHubIntel, UsernameProbe } from "../types.js";

function normalizeUrl(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
}

function extractDomains(text: string): string[] {
  const matches = text.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][-a-z0-9]*\.[a-z]{2,})/gi) || [];
  return [...new Set(matches.map((m) => normalizeUrl(m)))];
}

export function correlateAccounts(
  probes: UsernameProbe[],
  github?: GitHubIntel | null,
): AccountCorrelation {
  const verified = probes.filter((p) => p.exists);
  const sharedSignals: AccountCorrelation["sharedSignals"] = [];
  const linkedDomains = new Set<string>();
  const displayNames = new Map<string, string[]>();
  const mutualMetadata: string[] = [];

  for (const p of verified) {
    if (p.linkedUrl) {
      for (const d of extractDomains(p.linkedUrl)) linkedDomains.add(d);
    }
    if (p.bio) {
      for (const d of extractDomains(p.bio)) linkedDomains.add(d);
    }
    if (p.displayName) {
      const key = p.displayName.toLowerCase().trim();
      const list = displayNames.get(key) || [];
      list.push(p.platform);
      displayNames.set(key, list);
    }
  }

  if (github?.blog) {
    for (const d of extractDomains(github.blog)) linkedDomains.add(d);
  }
  if (github?.name) {
    const key = github.name.toLowerCase().trim();
    const list = displayNames.get(key) || [];
    list.push("GitHub");
    displayNames.set(key, list);
  }

  for (const domain of linkedDomains) {
    const platforms: string[] = [];
    for (const p of verified) {
      const blob = `${p.linkedUrl || ""} ${p.bio || ""}`.toLowerCase();
      if (blob.includes(domain)) platforms.push(p.platform);
    }
    if (github?.blog && normalizeUrl(github.blog).includes(domain)) platforms.push("GitHub");
    const unique = [...new Set(platforms)];
    if (unique.length >= 2) {
      sharedSignals.push({ signal: `shared-domain:${domain}`, platforms: unique, confidence: 85 });
      mutualMetadata.push(`${unique.join(", ")} all reference ${domain}`);
    } else if (unique.length === 1) {
      sharedSignals.push({ signal: `linked-domain:${domain}`, platforms: unique, confidence: 70 });
    }
  }

  let displayNameConsensus: string | null = null;
  for (const [name, platforms] of displayNames) {
    if (platforms.length >= 2) {
      displayNameConsensus = name;
      sharedSignals.push({
        signal: `display-name:${name}`,
        platforms: [...new Set(platforms)],
        confidence: 90,
      });
      mutualMetadata.push(`Display name "${name}" appears on ${[...new Set(platforms)].join(", ")}`);
      break;
    }
  }

  const locations = verified.filter((p) => p.location).map((p) => ({ loc: p.location!.toLowerCase(), plat: p.platform }));
  if (github?.location) locations.push({ loc: github.location.toLowerCase(), plat: "GitHub" });
  const locGroups = new Map<string, string[]>();
  for (const { loc, plat } of locations) {
    const g = locGroups.get(loc) || [];
    g.push(plat);
    locGroups.set(loc, g);
  }
  for (const [loc, platforms] of locGroups) {
    if (platforms.length >= 2) {
      sharedSignals.push({ signal: `location:${loc}`, platforms: [...new Set(platforms)], confidence: 75 });
      mutualMetadata.push(`Location "${loc}" shared across ${[...new Set(platforms)].join(", ")}`);
    }
  }

  const apiPlatforms = [...new Set(verified.filter((p) => p.method === "api" && p.confidence >= 85).map((p) => p.platform))];
  if (apiPlatforms.length >= 1) {
    mutualMetadata.push(
      `API-verified account(s) (${apiPlatforms.join(", ")}) - suitable for legal preservation requests`,
    );
  }

  return {
    sharedSignals: sharedSignals.sort((a, b) => b.confidence - a.confidence),
    linkedDomains: [...linkedDomains],
    displayNameConsensus,
    mutualMetadata,
    verifiedPlatformCount: verified.length,
    primaryUsername: verified.find((p) => p.method === "api")?.username,
  };
}