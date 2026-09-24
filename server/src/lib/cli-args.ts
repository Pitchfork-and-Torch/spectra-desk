import { enrichSubjectRaw, cleanFlagValue } from "../modules/subject-enrich.js";

const SHORT_FLAGS: Record<string, string> = {
  m: "mode",
  f: "first",
  l: "last",
  u: "username",
  e: "email",
  d: "domain",
};

const FIELD_MAP: Record<string, string> = {
  first: "firstName",
  last: "lastName",
  middle: "middleName",
};

const CLI_ONLY = new Set(["json", "out", "help"]);

/**
 * Shell-safe flag parser: supports --key=value, --key value, -m fast, and key=value.
 * Avoids Windows cmd quote-splitting issues when values use = form.
 */
export function parseCliFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];
    if (!token || token === "--") continue;

    if (/^[a-zA-Z][a-zA-Z0-9]*=/.test(token) && !token.startsWith("--")) {
      const eq = token.indexOf("=");
      out[token.slice(0, eq)] = token.slice(eq + 1);
      continue;
    }

    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        out[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const key = body;
      const next = argv[i + 1];
      if (next && !next.startsWith("-") && !/^[a-zA-Z][a-zA-Z0-9]*=/.test(next)) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
      continue;
    }

    if (token.startsWith("-") && token.length === 2) {
      const short = token[1];
      const long = SHORT_FLAGS[short];
      if (!long) continue;
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        out[long] = next;
        i++;
      } else {
        out[long] = "true";
      }
    }
  }

  return out;
}

export function resolveQueryMode(
  raw: Record<string, string | undefined>,
): "full" | "fast" | "validation" | "custom" {
  const mode = cleanFlagValue(raw.mode)?.toLowerCase();
  if (mode === "fast" || mode === "validation" || mode === "custom") return mode;
  const env = process.env.SPECTRA_MODE?.toLowerCase();
  if (env === "fast" || env === "validation" || env === "custom") return env;
  return "full";
}

/** Map CLI flags → engine investigation payload. */
export function normalizeInvestigationInput(flags: Record<string, string>): Record<string, string | undefined> {
  const raw: Record<string, string | undefined> = {};

  for (const [k, v] of Object.entries(flags)) {
    if (CLI_ONLY.has(k)) {
      raw[k] = cleanFlagValue(v);
      continue;
    }
    const mapped = FIELD_MAP[k] ?? k;
    raw[mapped] = cleanFlagValue(v);
  }

  if (!raw.mode) {
    const resolved = resolveQueryMode(raw);
    if (resolved !== "full") raw.mode = resolved;
  }

  return enrichSubjectRaw(raw);
}