/**
 * Spectra Desk Redactor - browser-side-style PII redaction for safe AI handoff (v7).
 * Replaces PII with numbered placeholders; exportable redaction map; restore path.
 * Local only - no network.
 */

export type PiiKind =
  | "EMAIL"
  | "PHONE"
  | "SSN"
  | "IBAN"
  | "IP"
  | "URL"
  | "CREDIT_CARD"
  | "DOB"
  | "ADDRESS_LINE"
  | "NAME"
  | "USERNAME"
  | "CUSTOM";

export interface RedactionEntry {
  placeholder: string;
  kind: PiiKind;
  original: string;
  index: number;
}

export interface RedactionResult {
  redacted: string;
  map: RedactionEntry[];
  counts: Partial<Record<PiiKind, number>>;
  disclaimer: string;
}

export interface RedactorOptions {
  /** Additional name strings to redact (subject first/last, etc.) */
  names?: string[];
  /** User-defined regex patterns (source string) */
  customPatterns?: Array<{ name: string; pattern: string; flags?: string }>;
  /** Also redact bare @handles */
  usernames?: string[];
  emails?: string[];
  phones?: string[];
}

const PATTERNS: Array<{ kind: PiiKind; re: RegExp }> = [
  { kind: "EMAIL", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "IBAN", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g },
  {
    kind: "CREDIT_CARD",
    re: /\b(?:\d[ -]*?){13,19}\b/g,
  },
  { kind: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: "IP", re: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },
  { kind: "URL", re: /\bhttps?:\/\/[^\s<>"')\]]+/gi },
  {
    kind: "PHONE",
    re: /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}\b/g,
  },
  {
    kind: "DOB",
    re: /\b(?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01])[\/\-.](?:19|20)\d{2}\b/g,
  },
];

function luhnOk(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function redactText(input: string, opts: RedactorOptions = {}): RedactionResult {
  const map: RedactionEntry[] = [];
  const counts: Partial<Record<PiiKind, number>> = {};
  const occupied = new Map<string, string>(); // original → placeholder

  function take(kind: PiiKind, original: string): string {
    const key = `${kind}::${original}`;
    const existing = occupied.get(key);
    if (existing) return existing;
    const index = (counts[kind] || 0) + 1;
    counts[kind] = index;
    const placeholder = `[${kind}_${index}]`;
    occupied.set(key, placeholder);
    map.push({ placeholder, kind, original, index });
    return placeholder;
  }

  let text = input;

  // Explicit subject strings first (longest first to avoid partial overlaps)
  const explicit: Array<{ kind: PiiKind; value: string }> = [];
  for (const n of opts.names || []) {
    if (n.trim().length >= 2) explicit.push({ kind: "NAME", value: n.trim() });
  }
  for (const e of opts.emails || []) {
    if (e.trim()) explicit.push({ kind: "EMAIL", value: e.trim() });
  }
  for (const p of opts.phones || []) {
    if (p.trim()) explicit.push({ kind: "PHONE", value: p.trim() });
  }
  for (const u of opts.usernames || []) {
    if (u.trim()) explicit.push({ kind: "USERNAME", value: u.trim().replace(/^@/, "") });
  }
  explicit.sort((a, b) => b.value.length - a.value.length);

  for (const { kind, value } of explicit) {
    if (!value) continue;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    text = text.replace(re, (m) => take(kind, m));
  }

  for (const { name, pattern, flags } of opts.customPatterns || []) {
    try {
      const re = new RegExp(pattern, flags ?? "gi");
      text = text.replace(re, (m) => take("CUSTOM", m));
      void name;
    } catch {
      /* skip bad pattern */
    }
  }

  for (const { kind, re } of PATTERNS) {
    // reset lastIndex
    re.lastIndex = 0;
    text = text.replace(re, (m) => {
      if (kind === "CREDIT_CARD" && !luhnOk(m)) return m;
      if (kind === "PHONE") {
        const digs = m.replace(/\D/g, "");
        if (digs.length < 7 || digs.length > 15) return m;
        // avoid redacting years or short numbers already partial
        if (digs.length === 4) return m;
      }
      if (kind === "IBAN" && m.length < 15) return m;
      return take(kind, m);
    });
  }

  // @handles (after emails so we don't double-hit)
  text = text.replace(/(?<![A-Za-z0-9._%+-])@([A-Za-z0-9_]{2,39})\b/g, (m) => take("USERNAME", m));

  return {
    redacted: text,
    map,
    counts,
    disclaimer:
      "Redaction is heuristic - verify before external AI submission. Map stays local; never paste the map with redacted text to untrusted parties.",
  };
}

export type RedactPreset = "client" | "counsel" | "press";

const PRESS_RESTORE: PiiKind[] = ["URL", "USERNAME"];

/** Client keeps the brief. Counsel strips contact PII. Press strips contact PII and keeps public URLs. */
export function redactPreset(input: string, preset: RedactPreset, opts: RedactorOptions = {}): RedactionResult {
  if (preset === "client") {
    return {
      redacted: input,
      map: [],
      counts: {},
      disclaimer: "Client skin is the sourced brief. It is not a redacted handoff.",
    };
  }
  const full = redactText(input, opts);
  if (preset === "counsel") {
    return { ...full, disclaimer: "Counsel-safe handoff. Verify before sending. The map stays on this machine." };
  }
  const restored = restoreText(
    full.redacted,
    full.map.filter((entry) => PRESS_RESTORE.includes(entry.kind)),
  );
  const kept = full.map.filter((entry) => !PRESS_RESTORE.includes(entry.kind));
  return {
    redacted: restored,
    map: kept,
    counts: full.counts,
    disclaimer: "Press handoff strips contact PII and keeps public URLs. Verify before sending.",
  };
}

export function restoreText(redacted: string, map: RedactionEntry[]): string {
  let text = redacted;
  // Longest placeholders first
  const sorted = [...map].sort((a, b) => b.placeholder.length - a.placeholder.length);
  for (const entry of sorted) {
    text = text.split(entry.placeholder).join(entry.original);
  }
  return text;
}

export function redactionMapToCsv(map: RedactionEntry[]): string {
  const lines = ["placeholder,kind,index,original"];
  for (const e of map) {
    const orig = `"${e.original.replace(/"/g, '""')}"`;
    lines.push(`${e.placeholder},${e.kind},${e.index},${orig}`);
  }
  return lines.join("\n");
}

export function parseRedactionMapCsv(csv: string): RedactionEntry[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const entries: RedactionEntry[] = [];
  for (const line of lines.slice(1)) {
    // simple CSV: placeholder,kind,index,"original"
    const m = line.match(/^(\[[^\]]+\]),([A-Z_]+),(\d+),(.*)$/);
    if (!m) continue;
    let original = m[4] || "";
    if (original.startsWith('"') && original.endsWith('"')) {
      original = original.slice(1, -1).replace(/""/g, '"');
    }
    entries.push({
      placeholder: m[1]!,
      kind: m[2] as PiiKind,
      index: parseInt(m[3]!, 10),
      original,
    });
  }
  return entries;
}
