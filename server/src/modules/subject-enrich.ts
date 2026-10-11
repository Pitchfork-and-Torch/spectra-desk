/**
 * Normalize subject fields from notes, CLI quirks, and site: directives
 * before anchor extraction and domain profiling.
 */

const SITE_DIRECTIVE_RE = /(?:^|[\s,;])site:\s*([a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,})/gi;
const DOMAIN_TOKEN_RE =
  /(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]*\.)+(?:[a-z]{2,}|xn--[a-z0-9-]+))/gi;

const PUBLIC_SUFFIX_BLOCK = new Set([
  "github.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "twitch.tv",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "reddit.com",
]);

function cleanDomain(raw: string): string | undefined {
  const d = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[),.;:]+$/, "");
  if (!d || !d.includes(".") || d.length > 63) return undefined;
  if (PUBLIC_SUFFIX_BLOCK.has(d)) return undefined;
  return d;
}

/** Pull explicit site: directives and bare domains from free text. */
export function domainsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const re of [SITE_DIRECTIVE_RE, DOMAIN_TOKEN_RE]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const d = cleanDomain(m[1]);
      if (d) found.add(d);
    }
  }
  return [...found];
}

/** Strip shell-escaped quotes Windows/cmd may leave on flag values. */
export function cleanFlagValue(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  let s = v.trim();
  s = s.replace(/^\\?["']+|\\?["']+$/g, "").trim();
  return s || undefined;
}

export function enrichSubjectRaw(
  raw: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined) out[k] = cleanFlagValue(v);
  }

  const notes = out.notes ?? "";
  let fromNotes = domainsFromText(notes);

  if (out.domain) {
    const d = cleanDomain(out.domain);
    if (d && !fromNotes.includes(d)) fromNotes = [d, ...fromNotes];
  }

  if (!out.employer && fromNotes[0]) {
    out.employer = fromNotes[0];
  }

  if (!out.website && fromNotes[0]) {
    out.website = fromNotes[0];
  }

  if (fromNotes.length && notes) {
    const extra = fromNotes.filter((d) => !notes.toLowerCase().includes(d));
    if (extra.length) {
      out.notes = `${notes} ${extra.map((d) => `site:${d}`).join(" ")}`.trim();
    }
  }

  return out;
}