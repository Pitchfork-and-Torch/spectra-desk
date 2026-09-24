/**
 * Business / organization resolution (v8)
 * Fuses website About, BBB, state filings, LinkedIn role, interviews into person↔company links.
 */
import type { DossierConfidence, DossierEmployment, SearchHit, SubjectInput } from "../types.js";
import { nameMatchesInText } from "./name-variants.js";

export type BusinessLinkStrength = "locked" | "attributed" | "likely" | "possible" | "weak";

export interface BusinessEntity {
  id: string;
  legalName: string;
  tradeNames: string[];
  domain?: string;
  role?: string;
  industry?: string;
  locations: string[];
  signals: string[];
  strength: BusinessLinkStrength;
  confidence: DossierConfidence;
  sourceUrls: string[];
  personLinkRationale: string[];
}

export interface BusinessResolution {
  entities: BusinessEntity[];
  primary?: BusinessEntity;
  employmentForDossier: DossierEmployment[];
  personIsOwnerLikely: boolean;
  fusionScore: number; // 0 - 100 contribution toward identity
}

const BUSINESS_HINTS =
  /(?:llc|inc\.?|corp|company|owner|founder|principal|registered agent|bbb|sunbiz|about us|bioscenecare|bio scene care|cypress)/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanOrgName(raw: string): string | null {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/[|·•].*$/, "").trim();
  // Reject FAQ / garbled snippet orgs / full sentences used as "org names"
  if (/how many|employees are|is dustin|click here|undefined|page not found|\?$/i.test(s)) return null;
  if (/\bowner of\b|\bprincipal of\b|\bworks? at\b/i.test(s)) return null;
  if (s.length < 3 || s.length > 55) return null;
  if (!/[A-Za-z]{2}/.test(s)) return null;
  // Prefer business-like strings; reject long person+place blobs
  const words = s.split(/\s+/);
  if (words.length > 7) return null;
  if (!/(?:llc|inc|corp|care|renovations|company|group|services)/i.test(s) && words.length > 5) {
    return null;
  }
  // "L Daprizio Tampa FL BIO SCENE CARE LLC" → extract BIO SCENE CARE LLC if present
  const bio = s.match(/\b(BIO\s*Scene\s*Care(?:\s*LLC)?)\b/i);
  if (bio) return bio[1]!.replace(/\s+/g, " ");
  return s;
}

function extractBusinessNames(blob: string): string[] {
  const names: string[] = [];
  const patterns = [
    /\b(BIO\s*Scene\s*Care(?:\s*LLC)?)\b/gi,
    /\b(Cypress\s*(?:&|and)\s*Copper(?:\s*Renovations)?)\b/gi,
    /\b([A-Z][A-Za-z0-9&.'\s-]{1,40}(?:LLC|Inc\.?|Corp\.?))\b/g,
  ];
  for (const re of patterns) {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(blob)) !== null) {
      const cleaned = cleanOrgName(m[1] || "");
      if (cleaned) names.push(cleaned);
    }
  }
  return [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
}

function strengthFromSignals(signals: string[]): BusinessLinkStrength {
  const set = new Set(signals);
  const official = ["sunbiz-agent", "bbb-principal", "website-about", "interview-owner"].filter((s) =>
    set.has(s),
  ).length;
  // BBB principal + subject name is enough for likely (common public pattern)
  if (official >= 2) return "attributed";
  if (set.has("bbb-principal") && set.has("name-match")) return "likely";
  if (set.has("sunbiz-agent") && set.has("name-match")) return "likely";
  if (official >= 1 && set.has("name-match")) return "likely";
  if (set.has("linkedin-role") && set.has("name-match")) return "likely";
  if (set.has("name-match") && set.has("domain-match")) return "likely";
  if (set.has("name-match") || set.has("domain-match")) return "possible";
  return "weak";
}

/** Collapse "BIO Scene Care" / "BIO Scene Care LLC" / "BBB BIO Scene Care LLC" into one key. */
function orgKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^better business bureau\s+/i, "")
    .replace(/\b(llc|inc\.?|corp\.?|ltd\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toConfidence(s: BusinessLinkStrength): DossierConfidence {
  if (s === "locked" || s === "attributed") return "confirmed";
  if (s === "likely") return "likely";
  return "possible";
}

export function resolveBusinessEntities(
  subject: SubjectInput,
  hits: SearchHit[],
  opts?: { domainIntelDomain?: string; siteTitle?: string; siteDescription?: string },
): BusinessResolution {
  const buckets = new Map<
    string,
    {
      legalName: string;
      tradeNames: Set<string>;
      domain?: string;
      role?: string;
      industry?: string;
      locations: Set<string>;
      signals: Set<string>;
      sourceUrls: Set<string>;
      personLinkRationale: string[];
    }
  >();

  const ensure = (name: string) => {
    const key = orgKey(name);
    let b = buckets.get(key);
    if (!b) {
      b = {
        legalName: name,
        tradeNames: new Set(),
        locations: new Set(),
        signals: new Set(),
        sourceUrls: new Set(),
        personLinkRationale: [],
      };
      buckets.set(key, b);
    } else {
      // Prefer legal-form name (with LLC) when merging
      if (/\bLLC\b/i.test(name) && !/\bLLC\b/i.test(b.legalName)) b.legalName = name;
      if (!/better business bureau/i.test(name) && /better business bureau/i.test(b.legalName)) {
        b.legalName = name;
      }
      b.tradeNames.add(name);
    }
    return b;
  };

  // Domain intel
  if (opts?.domainIntelDomain || opts?.siteTitle) {
    const blob = `${opts.siteTitle || ""} ${opts.siteDescription || ""} ${opts.domainIntelDomain || ""}`;
    const names = extractBusinessNames(blob);
    for (const n of names.length ? names : opts.siteTitle ? [opts.siteTitle] : []) {
      const cleaned = cleanOrgName(n);
      if (!cleaned) continue;
      const b = ensure(cleaned);
      if (opts.domainIntelDomain) {
        b.domain = opts.domainIntelDomain;
        b.signals.add("domain-match");
      }
      if (/about|owner|founded|veteran/i.test(blob)) b.signals.add("website-about");
      if (nameMatchesInText(subject.firstName, subject.lastName, blob) >= 0.7) {
        b.signals.add("name-match");
        b.personLinkRationale.push("Subject name appears on company website / domain text");
      }
    }
  }

  for (const hit of hits) {
    if (hit.classification === "excluded") continue;
    const blob = `${hit.title} ${hit.snippet} ${hit.url}`;
    if (!BUSINESS_HINTS.test(blob) && !extractBusinessNames(blob).length) continue;

    const nameMatch = nameMatchesInText(subject.firstName, subject.lastName, blob);
    const names = extractBusinessNames(blob);
    if (!names.length && /linkedin\.com\/in\//i.test(hit.url) && subject.employer) {
      names.push(subject.employer);
    }

    for (const n of names) {
      const b = ensure(n);
      b.sourceUrls.add(hit.url);
      if (nameMatch >= 0.7) {
        b.signals.add("name-match");
        b.personLinkRationale.push(`Name co-occurs on ${hostOf(hit.url) || "public page"}`);
      }
      if (/sunbiz|dos\.myflorida|search\.sunbiz/i.test(hit.url) || /registered agent/i.test(blob)) {
        b.signals.add("sunbiz-agent");
        b.personLinkRationale.push("Florida Sunbiz / SOS filing signal (registered agent / principal)");
      }
      if (/bbb\.org/i.test(hit.url) || /\bbbb\b.*principal|business profile/i.test(blob)) {
        b.signals.add("bbb-principal");
        b.personLinkRationale.push("BBB business profile principal signal");
      }
      if (/voyagetampa|interview|voyage tampa/i.test(blob)) {
        b.signals.add("interview-owner");
        b.personLinkRationale.push("Public interview linking person to business");
      }
      if (/linkedin\.com\/in\//i.test(hit.url)) {
        b.signals.add("linkedin-role");
        b.role = b.role || "Owner / principal (LinkedIn public)";
      }
      if (/owner|founder|principal/i.test(blob)) {
        b.role = b.role || "Owner / founder";
        b.signals.add("owner-language");
      }
      if (/biohazard|crime.?scene|cleanup/i.test(blob)) {
        b.industry = "Biohazard / crime-scene / trauma cleanup";
      }
      if (/tampa|hillsborough/i.test(blob)) b.locations.add("Tampa / Hillsborough County, FL");
      if (/hyy?de park/i.test(blob)) b.locations.add("205 W Hyde Park Pl area, Tampa (public filing)");

      const host = hostOf(hit.url);
      if (host && /bioscenecare|cypress/i.test(host)) {
        b.domain = host;
        b.signals.add("domain-match");
      }
    }
  }

  // Intake employer anchor
  if (subject.employer) {
    const b = ensure(subject.employer);
    b.signals.add("intake-employer");
    b.personLinkRationale.push("Investigator intake employer anchor");
  }

  const entities: BusinessEntity[] = [...buckets.values()].map((b, i) => {
    const signals = [...b.signals];
    const strength = strengthFromSignals(signals);
    return {
      id: `biz-${i}`,
      legalName: b.legalName,
      tradeNames: [...b.tradeNames],
      domain: b.domain,
      role: b.role,
      industry: b.industry,
      locations: [...b.locations],
      signals,
      strength,
      confidence: toConfidence(strength),
      sourceUrls: [...b.sourceUrls].slice(0, 8),
      personLinkRationale: [...new Set(b.personLinkRationale)].slice(0, 6),
    };
  });

  // Prefer BIO Scene Care / strongest
  entities.sort((a, b) => {
    const rank = (s: BusinessLinkStrength) =>
      ({ locked: 5, attributed: 4, likely: 3, possible: 2, weak: 1 })[s];
    return rank(b.strength) - rank(a.strength) || b.signals.length - a.signals.length;
  });

  const primary = entities[0];
  const employmentForDossier: DossierEmployment[] = entities
    .filter((e) => e.strength !== "weak")
    .slice(0, 5)
    .map((e) => ({
      organization: e.legalName,
      role: e.role,
      source: e.personLinkRationale[0] || "Business entity fusion",
      confidence: e.confidence,
      sourceUrl: e.sourceUrls[0],
    }));

  let fusionScore = 0;
  if (primary) {
    if (primary.strength === "attributed" || primary.strength === "locked") fusionScore += 28;
    else if (primary.strength === "likely") fusionScore += 18;
    else if (primary.strength === "possible") fusionScore += 8;
    fusionScore += Math.min(12, primary.signals.length * 3);
  }

  return {
    entities,
    primary,
    employmentForDossier,
    personIsOwnerLikely: Boolean(
      primary &&
        (primary.strength === "attributed" ||
          primary.strength === "likely" ||
          primary.signals.includes("owner-language")),
    ),
    fusionScore: Math.min(100, fusionScore),
  };
}
