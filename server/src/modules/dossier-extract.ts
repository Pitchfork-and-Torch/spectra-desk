import type { DossierConfidence, DossierContact, DossierEmployment, DossierRelative } from "../types.js";

export interface ExtractedFacts {
  emails: Array<{ value: string; source: string; confidence: DossierConfidence }>;
  phones: Array<{ value: string; source: string; confidence: DossierConfidence }>;
  addresses: Array<{ value: string; source: string; confidence: DossierConfidence }>;
  employment: DossierEmployment[];
  relatives: DossierRelative[];
  locations: Array<{ label: string; source: string; confidence: DossierConfidence }>;
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

const SPOUSE_PATTERNS = [
  /(?:married\s+to|wife\s+of|husband\s+of|spouse[:\s]+|partner[:\s]+)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,2})/gi,
  /(?:wife|husband)[,\s]+([A-Z][a-z]+\s+[A-Z][a-z'.-]+)/gi,
];

const CHILD_PATTERNS = [
  /\b(?:son|daughter|child|children)[:\s]+\s*([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,2})/gi,
  /(?:father\s+of|mother\s+of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,2})/gi,
];

const EMPLOYMENT_PATTERNS = [
  /(?:works? at|employed (?:at|by)|developer at|engineer at|founder of|CEO of|director at)\s+([A-Z][A-Za-z0-9&.'\s-]{2,48})/gi,
  /(?:at|with)\s+([A-Z][A-Za-z0-9&.'\s-]{2,40}(?:Inc\.?|LLC|Corp\.?|Ltd\.?|University|College))/gi,
];

const LOCATION_PATTERNS = [
  /(?:based in|lives in|located in|from|resident of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}(?:,\s*[A-Z]{2})?)/gi,
  /\bin\s+([A-Z][a-z]+(?:,\s*[A-Z]{2})?)\b/gi,
];

const JUNK_NAMES = /^(the|and|with|from|their|his|her|our|your|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i;

function cleanName(raw: string): string | null {
  const name = raw.replace(/[.,;:!?]+$/, "").trim();
  if (name.length < 3 || name.length > 50) return null;
  const parts = name.split(/\s+/);
  if (parts.some((p) => JUNK_NAMES.test(p))) return null;
  if (!/^[A-Z]/.test(parts[0]!)) return null;
  return name;
}

function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function extractFactsFromText(text: string, sourceLabel: string, sourceUrl?: string): ExtractedFacts {
  const emails: ExtractedFacts["emails"] = [];
  const phones: ExtractedFacts["phones"] = [];
  const addresses: ExtractedFacts["addresses"] = [];
  const employment: DossierEmployment[] = [];
  const relatives: DossierRelative[] = [];
  const locations: ExtractedFacts["locations"] = [];

  let m: RegExpExecArray | null;

  const emailRe = new RegExp(EMAIL_RE.source, EMAIL_RE.flags);
  while ((m = emailRe.exec(text)) !== null) {
    emails.push({ value: m[0].toLowerCase(), source: sourceLabel, confidence: "possible" });
  }

  const phoneRe = new RegExp(PHONE_RE.source, PHONE_RE.flags);
  while ((m = phoneRe.exec(text)) !== null) {
    phones.push({ value: m[0], source: sourceLabel, confidence: "possible" });
  }

  for (const pattern of SPOUSE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(text)) !== null) {
      const name = cleanName(m[1] || "");
      if (name) {
        relatives.push({
          relation: "spouse",
          name,
          source: sourceLabel,
          confidence: "possible",
          sourceUrl,
        });
      }
    }
  }

  for (const pattern of CHILD_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(text)) !== null) {
      const name = cleanName(m[1] || "");
      if (name) {
        relatives.push({
          relation: "child",
          name,
          source: sourceLabel,
          confidence: "possible",
          sourceUrl,
        });
      }
    }
  }

  for (const pattern of EMPLOYMENT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(text)) !== null) {
      const org = m[1]?.trim();
      if (org && org.length > 2) {
        employment.push({
          organization: org.slice(0, 80),
          source: sourceLabel,
          confidence: "possible",
          sourceUrl,
        });
      }
    }
  }

  for (const pattern of LOCATION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(text)) !== null) {
      const loc = m[1]?.trim();
      if (loc && loc.length > 2) {
        locations.push({ label: loc, source: sourceLabel, confidence: "possible" });
      }
    }
  }

  return {
    emails: uniqueBy(emails, (e) => e.value),
    phones: uniqueBy(phones, (p) => p.value),
    addresses: uniqueBy(addresses, (a) => a.value),
    employment: uniqueBy(employment, (e) => e.organization),
    relatives: uniqueBy(relatives, (r) => `${r.relation}:${r.name}`),
    locations: uniqueBy(locations, (l) => l.label),
  };
}

export function mergeExtracted(...chunks: ExtractedFacts[]): ExtractedFacts {
  return {
    emails: uniqueBy(chunks.flatMap((c) => c.emails), (e) => e.value),
    phones: uniqueBy(chunks.flatMap((c) => c.phones), (p) => p.value),
    addresses: uniqueBy(chunks.flatMap((c) => c.addresses), (a) => a.value),
    employment: uniqueBy(chunks.flatMap((c) => c.employment), (e) => e.organization),
    relatives: uniqueBy(chunks.flatMap((c) => c.relatives), (r) => `${r.relation}:${r.name}`),
    locations: uniqueBy(chunks.flatMap((c) => c.locations), (l) => l.label),
  };
}

export function toContacts(facts: ExtractedFacts): DossierContact[] {
  const contacts: DossierContact[] = [];
  for (const e of facts.emails) {
    contacts.push({ type: "email", value: e.value, source: e.source, confidence: e.confidence });
  }
  for (const p of facts.phones) {
    contacts.push({ type: "phone", value: p.value, source: p.source, confidence: p.confidence });
  }
  for (const a of facts.addresses) {
    contacts.push({ type: "address", value: a.value, source: a.source, confidence: a.confidence });
  }
  return contacts;
}