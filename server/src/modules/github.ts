export interface GitHubProfile {
  login: string;
  name: string | null;
  bio: string | null;
  blog: string | null;
  location: string | null;
  company: string | null;
  publicRepos: number;
  followers: number;
  createdAt: string;
  url: string;
  avatarUrl: string;
}

export async function fetchGitHubProfile(username: string): Promise<GitHubProfile | null> {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "SpectraDesk-OSINT/2.0",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      login: String(data.login || username),
      name: data.name ? String(data.name) : null,
      bio: data.bio ? String(data.bio) : null,
      blog: data.blog ? String(data.blog) : null,
      location: data.location ? String(data.location) : null,
      company: data.company ? String(data.company) : null,
      publicRepos: Number(data.public_repos || 0),
      followers: Number(data.followers || 0),
      createdAt: String(data.created_at || ""),
      url: String(data.html_url || `https://github.com/${username}`),
      avatarUrl: String(data.avatar_url || ""),
    };
  } catch {
    return null;
  }
}

export interface GitHubRepo {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  updatedAt: string;
}

export async function fetchGitHubRepos(username: string, limit = 8): Promise<GitHubRepo[]> {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=${limit}&sort=updated`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "SpectraDesk-OSINT/2.2" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<Record<string, unknown>>;
    return data.slice(0, limit).map((r) => ({
      name: String(r.name || ""),
      url: String(r.html_url || ""),
      description: r.description ? String(r.description) : null,
      language: r.language ? String(r.language) : null,
      updatedAt: String(r.updated_at || ""),
    }));
  } catch {
    return [];
  }
}

export function parseGitHubUsername(url: string): string | null {
  const m = url.match(/github\.com\/([^/?#]+)/i);
  if (!m) return null;
  const user = m[1];
  if (["orgs", "organizations", "settings", "login", "signup", "features"].includes(user.toLowerCase())) return null;
  return user;
}