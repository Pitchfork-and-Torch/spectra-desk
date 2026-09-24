import type { GitHubIntel, OsintReport, SocialProfileMetadata, UsernameProbe } from "../types.js";

function probeMeta(probe: UsernameProbe): SocialProfileMetadata | undefined {
  if (!probe.exists) return undefined;
  const meta: SocialProfileMetadata = {
    platform: probe.platform,
    username: probe.username,
    url: probe.url,
    verificationNotes: [],
  };

  if (probe.method === "api") meta.verificationNotes.push("API-verified existence");
  if (probe.method === "site-link") meta.verificationNotes.push("Linked from subject anchor site");
  if (probe.displayName) meta.verificationNotes.push(`Display name: ${probe.displayName}`);
  if (probe.location) meta.verificationNotes.push(`Listed location: ${probe.location}`);
  if (probe.bio) meta.verificationNotes.push(`Bio excerpt: ${probe.bio.slice(0, 120)}`);

  return meta;
}

function githubMeta(gh: GitHubIntel): SocialProfileMetadata {
  const notes = [
    "GitHub REST API",
    gh.name ? `Registered name: ${gh.name}` : "No public name",
    gh.company ? `Company field: ${gh.company}` : "",
    gh.location ? `Location: ${gh.location}` : "",
    `${gh.publicRepos} public repos`,
  ].filter(Boolean);

  return {
    platform: "GitHub",
    username: gh.login,
    url: gh.url,
    joinDate: undefined,
    followerCount: undefined,
    postCount: gh.publicRepos,
    verified: false,
    verificationNotes: notes,
    linkedAccounts: gh.blog ? [gh.blog] : [],
  };
}

/** Enrich social profile metadata from probes and API intel. */
export function buildSocialMetadata(report: OsintReport): SocialProfileMetadata[] {
  const out: SocialProfileMetadata[] = [];
  const seen = new Set<string>();

  if (report.githubIntel) {
    const m = githubMeta(report.githubIntel);
    seen.add(m.url);
    if (report.githubIntel.createdAt) m.joinDate = report.githubIntel.createdAt.slice(0, 10);
    if (report.githubIntel.followers != null) m.followerCount = report.githubIntel.followers;
    out.push(m);
  }

  for (const probe of report.usernameProbes || []) {
    if (seen.has(probe.url)) continue;
    const meta = probeMeta(probe);
    if (!meta) continue;
    seen.add(probe.url);

    const scored = report.scoredAccounts?.find((s) => s.url === probe.url);
    if (scored?.portraitVerdict === "matches-anchor") {
      meta.verificationNotes.push("Portrait matches investigator reference");
    } else if (scored?.portraitVerdict === "likely-same") {
      meta.verificationNotes.push("Portrait likely same person");
    }
    if (scored?.tier === "attributed") meta.verificationNotes.push(`Log-odds attributed (${Math.round(scored.posterior * 100)}%)`);
    if (scored?.tier === "quarantined") meta.verificationNotes.push("Quarantined - manual verification required");

    out.push(meta);
  }

  return out.sort((a, b) => b.verificationNotes.length - a.verificationNotes.length);
}