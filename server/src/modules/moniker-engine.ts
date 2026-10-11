/**
 * Moniker / Alias Engine (v6)
 * Generates ranked handle candidates beyond exact+dotted forms.
 * Public-source only - generation priors, not attribution.
 */
import type { SubjectInput } from "../types.js";
import { nameVariants } from "./name-variants.js";
import { deriveUsernames, fullName } from "./subject.js";

export type MonikerKind =
  | "exact"
  | "dotted"
  | "underscore"
  | "hyphen"
  | "initial"
  | "nickname"
  | "leet"
  | "reverse"
  | "concat"
  | "aka"
  | "gaming"
  | "intake";

export interface MonikerCandidate {
  handle: string;
  kind: MonikerKind;
  confidence: number;
  sources: string[];
  notes?: string;
}

const LEET_MAP: Record<string, string> = {
  a: "4",
  e: "3",
  i: "1",
  o: "0",
  s: "5",
  t: "7",
};

function cleanHandle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 32);
}

function leetify(s: string): string {
  return s
    .split("")
    .map((c) => LEET_MAP[c] || c)
    .join("");
}

function push(
  out: Map<string, MonikerCandidate>,
  handle: string,
  kind: MonikerKind,
  confidence: number,
  source: string,
  notes?: string,
) {
  const h = cleanHandle(handle);
  if (!h || h.length < 3) return;
  const prev = out.get(h);
  if (prev) {
    prev.confidence = Math.max(prev.confidence, confidence);
    if (!prev.sources.includes(source)) prev.sources.push(source);
    if (notes && !prev.notes) prev.notes = notes;
    return;
  }
  out.set(h, { handle: h, kind, confidence, sources: [source], notes });
}

/** Expand moniker/alias inventory for a subject. */
export function generateMonikers(subject: SubjectInput, opts?: { max?: number }): MonikerCandidate[] {
  const max = opts?.max ?? 48;
  const out = new Map<string, MonikerCandidate>();
  const first = (subject.firstName || "").toLowerCase().trim();
  const last = (subject.lastName || "").toLowerCase().trim();
  const middle = (subject.middleName || "").toLowerCase().trim();
  const fi = first[0] || "";
  const li = last[0] || "";

  // Intake username always highest prior
  if (subject.username) {
    push(out, subject.username, "intake", 0.95, "intake-username");
  }
  if (subject.email) {
    const local = subject.email.split("@")[0] || "";
    push(out, local, "intake", 0.9, "email-local");
  }

  // Existing deriveUsernames baseline
  for (const u of deriveUsernames(subject)) {
    push(out, u, u.includes(".") ? "dotted" : u.includes("_") ? "underscore" : "exact", 0.75, "derive-usernames");
  }

  if (first && last) {
    push(out, `${first}${last}`, "concat", 0.8, "name-concat");
    push(out, `${first}.${last}`, "dotted", 0.82, "name-dotted");
    push(out, `${first}_${last}`, "underscore", 0.78, "name-underscore");
    push(out, `${first}-${last}`, "hyphen", 0.72, "name-hyphen");
    push(out, `${fi}${last}`, "initial", 0.7, "first-initial");
    push(out, `${first}${li}`, "initial", 0.55, "last-initial");
    push(out, `${fi}.${last}`, "initial", 0.68, "initial-dotted");
    push(out, `${fi}_${last}`, "initial", 0.65, "initial-underscore");
    push(out, `${last}${first}`, "reverse", 0.5, "name-reversed");
    push(out, `${last}.${first}`, "reverse", 0.48, "name-reversed-dotted");
    if (middle) {
      const mi = middle[0] || "";
      push(out, `${first}${mi}${last}`, "initial", 0.7, "middle-initial-concat");
      push(out, `${first}.${mi}.${last}`, "initial", 0.72, "middle-initial-dotted");
      push(out, `${fi}${mi}${last}`, "initial", 0.66, "fmi-last");
    }

    // Nickname forms
    for (const nick of nameVariants(first)) {
      if (nick === first) continue;
      push(out, `${nick}${last}`, "nickname", 0.62, "nickname-concat");
      push(out, `${nick}.${last}`, "nickname", 0.64, "nickname-dotted");
      push(out, `${nick}_${last}`, "nickname", 0.6, "nickname-underscore");
    }

    // Light leetspeak (one transform)
    const base = `${first}${last}`;
    const leet = leetify(base);
    if (leet !== base) push(out, leet, "leet", 0.35, "leet-full", "Low prior - gaming/alias style");
    push(out, `${first}${leetify(last)}`, "leet", 0.32, "leet-last");

    // Gaming-style
    push(out, `${first}${last}1`, "gaming", 0.28, "gaming-suffix");
    push(out, `${fi}${last}ttv`, "gaming", 0.22, "gaming-ttv");
    push(out, `x${first}${last}`, "gaming", 0.2, "gaming-prefix");
  }

  // AKA / formerly style tokens from notes
  const notes = (subject.notes || "").toLowerCase();
  const akaMatch = notes.match(/(?:aka|a\.k\.a\.|formerly|also known as|alias)\s+[@"]?([a-z0-9._-]{3,32})/i);
  if (akaMatch?.[1]) {
    push(out, akaMatch[1], "aka", 0.88, "notes-aka", "Parsed from investigator notes");
  }

  return [...out.values()]
    .sort((a, b) => b.confidence - a.confidence || a.handle.localeCompare(b.handle))
    .slice(0, max);
}

/** Search dorks to discover reverse-username / moniker mentions (public web). */
export function buildMonikerDiscoveryDorks(subject: SubjectInput, monikers: MonikerCandidate[]): string[] {
  const name = fullName(subject);
  const loc = [subject.city, subject.state].filter(Boolean).join(" ");
  const dorks = new Set<string>();
  if (name) {
    dorks.add(`"${name}" (aka OR "also known as" OR formerly OR alias)`);
    if (loc) dorks.add(`"${name}" "${loc}" (instagram OR twitter OR tiktok OR github)`);
    dorks.add(`"${name}" site:linkedin.com/in`);
    dorks.add(`"${name}" ("@") (twitter OR x.com OR instagram)`);
  }
  for (const m of monikers.filter((x) => x.confidence >= 0.65).slice(0, 8)) {
    dorks.add(`"${m.handle}" "${lastNameOrEmpty(subject)}"`);
    dorks.add(`"@${m.handle}"`);
    if (name) dorks.add(`"${m.handle}" "${name}"`);
  }
  return [...dorks].slice(0, 16);
}

function lastNameOrEmpty(s: SubjectInput): string {
  return s.lastName || "";
}

/** Merge monikers discovered from free text (bios, search snippets). */
export function extractMonikersFromText(text: string, subject: SubjectInput): MonikerCandidate[] {
  const out = new Map<string, MonikerCandidate>();
  const re = /@([A-Za-z0-9_]{3,32})|(?:aka|formerly|alias)\s+([A-Za-z0-9._-]{3,32})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const handle = m[1] || m[2];
    if (!handle) continue;
    // Prefer handles that share name tokens
    const lower = handle.toLowerCase();
    const last = (subject.lastName || "").toLowerCase();
    const first = (subject.firstName || "").toLowerCase();
    let conf = 0.45;
    if (last && lower.includes(last)) conf = 0.75;
    if (first && last && lower.includes(first) && lower.includes(last)) conf = 0.85;
    push(out, handle, "aka", conf, "text-extract");
  }
  return [...out.values()];
}
