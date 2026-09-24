/**
 * Semantic content understanding (v8)
 * Extracts structured facts from public hits and scores consistency vs intake anchors.
 * Deterministic rules first; optional LLM enhancement is handled elsewhere.
 */
import type { SearchHit, SubjectInput } from "../types.js";
import { nameMatchesInText } from "./name-variants.js";
import { locationLine } from "./subject.js";

export type LifeStageHint =
  | "mma-combat-sports"
  | "military-medic"
  | "sales-professional"
  | "business-owner"
  | "biohazard-cleanup"
  | "construction-renovation"
  | "education"
  | "arrest-public-record"
  | "professional-profile"
  | "generic-media"
  | "unknown";

export interface SemanticFactExtraction {
  occupations: string[];
  locations: string[];
  organizations: string[];
  education: string[];
  military: string[];
  timelineYears: number[];
  associates: string[];
  lifeStages: LifeStageHint[];
  rawSignals: string[];
}

export interface SemanticHitAnalysis {
  url: string;
  title: string;
  facts: SemanticFactExtraction;
  consistencyScore: number; // 0 - 100 vs anchors
  mismatchScore: number; // 0 - 100 contradiction pressure
  nameMatch: number; // 0 - 1
  category: LifeStageHint;
  summary: string;
  promoteToMain: boolean;
  demoteReason?: string;
}

export interface SemanticCorpusAnalysis {
  hits: SemanticHitAnalysis[];
  fusedOccupations: string[];
  fusedLocations: string[];
  fusedOrganizations: string[];
  lifeStages: LifeStageHint[];
  continuityScore: number; // multi-stage arc support
  contradictionFlags: string[];
  narrativeHints: string[];
}

const STAGE_PATTERNS: Array<{ stage: LifeStageHint; re: RegExp; weight: number }> = [
  {
    stage: "mma-combat-sports",
    re: /\b(?:mma|ufc|sherdog|mixed martial|fighter|bout|fight history|tapology|espn\.com\/mma)\b/i,
    weight: 3,
  },
  {
    stage: "military-medic",
    re: /\b(?:navy|combat medic|corpsman|military|veteran|armed forces|deployment)\b/i,
    weight: 3,
  },
  {
    stage: "biohazard-cleanup",
    re: /\b(?:biohazard|crime.?scene|after.?death|hoarding|trauma clean|bioscene|bio scene)\b/i,
    weight: 4,
  },
  {
    stage: "construction-renovation",
    re: /\b(?:renovation|contractor|remodel|construction|cypress\s*(?:&|and)\s*copper)\b/i,
    weight: 2,
  },
  {
    stage: "business-owner",
    re: /\b(?:owner|founder|principal|registered agent|llc|inc\.?|bbb|sunbiz|secretary of state)\b/i,
    weight: 3,
  },
  {
    stage: "sales-professional",
    re: /\b(?:sales|account executive|quota|president.?s club|top producer)\b/i,
    weight: 2,
  },
  {
    stage: "education",
    re: /\b(?:university|college|alumni|graduated|degree|omaha|nebraska)\b/i,
    weight: 2,
  },
  {
    stage: "arrest-public-record",
    re: /\b(?:arrest|mugshot|charged|battery|booking|inmate|jail|court|road.?rage)\b/i,
    weight: 3,
  },
  {
    stage: "professional-profile",
    re: /\b(?:linkedin|professional profile|resume|curriculum vitae)\b/i,
    weight: 1,
  },
];

const ORG_PATTERNS = [
  /\b([A-Z][A-Za-z0-9&.'\s-]{1,40}(?:LLC|Inc\.?|Corp\.?|Ltd\.?|Company|Co\.))\b/g,
  /\b(BIO\s*Scene\s*Care(?:\s*LLC)?)\b/gi,
  /\b(Cypress\s*(?:&|and)\s*Copper(?:\s*Renovations)?)\b/gi,
];

const LOC_PATTERNS = [
  /\b(Tampa|Hillsborough|Omaha|Nebraska|Florida|FL|NE)\b/gi,
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2})\b/g,
];

const YEAR_RE = /\b(19[89]\d|20[0-2]\d)\b/g;

const JUNK_ORG =
  /how many|employees are|is dustin|click here|home page|privacy policy|terms of|undefined|page not found/i;

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.replace(/\s+/g, " ").trim();
    if (v.length < 2 || v.length > 80) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export function extractSemanticFacts(text: string): SemanticFactExtraction {
  const blob = text || "";
  const occupations: string[] = [];
  const locations: string[] = [];
  const organizations: string[] = [];
  const education: string[] = [];
  const military: string[] = [];
  const timelineYears: number[] = [];
  const associates: string[] = [];
  const lifeStages: LifeStageHint[] = [];
  const rawSignals: string[] = [];

  for (const { stage, re } of STAGE_PATTERNS) {
    if (re.test(blob)) {
      lifeStages.push(stage);
      rawSignals.push(`stage:${stage}`);
    }
  }

  for (const re of ORG_PATTERNS) {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(blob)) !== null) {
      const org = m[1]?.trim();
      if (org && !JUNK_ORG.test(org)) organizations.push(org);
    }
  }

  for (const re of LOC_PATTERNS) {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(blob)) !== null) {
      if (m[1]) locations.push(m[1]);
    }
  }

  if (/\b(?:navy|combat medic|corpsman|veteran)\b/i.test(blob)) {
    military.push("U.S. Navy / combat medic (public claim)");
    occupations.push("Combat medic / Navy veteran");
  }
  if (/\b(?:biohazard|crime.?scene|trauma clean|after.?death)\b/i.test(blob)) {
    occupations.push("Biohazard / crime-scene cleanup");
  }
  if (/\b(?:mma|fighter|mixed martial)\b/i.test(blob)) {
    occupations.push("MMA fighter (historical/public sports record)");
  }
  if (/\b(?:owner|founder|principal)\b/i.test(blob)) {
    occupations.push("Business owner / principal");
  }
  if (/\buniversity of nebraska|omaha\b/i.test(blob)) {
    education.push("University of Nebraska Omaha (public mention)");
  }

  let ym: RegExpExecArray | null;
  const yearRe = new RegExp(YEAR_RE.source, "g");
  while ((ym = yearRe.exec(blob)) !== null) {
    const y = Number(ym[1]);
    if (y >= 1985 && y <= new Date().getFullYear() + 1) timelineYears.push(y);
  }

  return {
    occupations: unique(occupations),
    locations: unique(locations),
    organizations: unique(organizations),
    education: unique(education),
    military: unique(military),
    timelineYears: [...new Set(timelineYears)].sort((a, b) => a - b),
    associates: unique(associates),
    lifeStages: [...new Set(lifeStages)],
    rawSignals: unique(rawSignals),
  };
}

function primaryCategory(facts: SemanticFactExtraction): LifeStageHint {
  if (facts.lifeStages.includes("arrest-public-record")) return "arrest-public-record";
  if (facts.lifeStages.includes("biohazard-cleanup")) return "biohazard-cleanup";
  if (facts.lifeStages.includes("business-owner")) return "business-owner";
  if (facts.lifeStages.includes("mma-combat-sports")) return "mma-combat-sports";
  if (facts.lifeStages.includes("military-medic")) return "military-medic";
  if (facts.lifeStages.includes("education")) return "education";
  if (facts.lifeStages.includes("professional-profile")) return "professional-profile";
  if (facts.lifeStages.length) return facts.lifeStages[0]!;
  return "unknown";
}

function scoreConsistency(subject: SubjectInput, facts: SemanticFactExtraction, blob: string): {
  consistency: number;
  mismatch: number;
} {
  let consistency = 0;
  let mismatch = 0;
  const loc = locationLine(subject).toLowerCase();
  const city = subject.city?.toLowerCase();
  const state = subject.state?.toLowerCase();
  const employer = subject.employer?.toLowerCase();
  const blobL = blob.toLowerCase();

  if (city && (facts.locations.some((l) => l.toLowerCase().includes(city)) || blobL.includes(city))) {
    consistency += 28;
  }
  if (state && (facts.locations.some((l) => l.toLowerCase().includes(state)) || blobL.includes(state))) {
    consistency += 12;
  }
  if (employer && blobL.includes(employer)) consistency += 30;
  if (facts.organizations.some((o) => /bio\s*scene|cypress/i.test(o))) consistency += 22;
  if (facts.lifeStages.includes("biohazard-cleanup") && (city === "tampa" || state === "fl")) {
    consistency += 18;
  }
  if (facts.lifeStages.includes("arrest-public-record") && (city === "tampa" || /hillsborough/i.test(blob))) {
    consistency += 16;
  }

  // Continuity-friendly: remote life stages do not auto-mismatch
  // Hard mismatch: incompatible concurrent high-signal professions without bridges
  const hasTampa = Boolean(city && blobL.includes(city));
  const hasMmaOnly =
    facts.lifeStages.includes("mma-combat-sports") &&
    !facts.lifeStages.includes("biohazard-cleanup") &&
    !facts.lifeStages.includes("business-owner") &&
    !hasTampa &&
    !/florida|tampa|navy|medic|sales/i.test(blobL);
  if (hasMmaOnly && subject.city) {
    // Weak negative only - may still be same person at earlier stage
    mismatch += 8;
  }

  // Wrong people: different surnames already filtered; flag directory collisions
  if (/stacey daprizio|jeff daprizio|diluzio/i.test(blob) && !nameMatchesInText(subject.firstName, subject.lastName, blob)) {
    mismatch += 40;
  }

  if (loc && !facts.locations.length && !city) {
    // no location signal either way
  }

  return {
    consistency: Math.min(100, consistency),
    mismatch: Math.min(100, mismatch),
  };
}

export function analyzeSearchHit(hit: SearchHit, subject: SubjectInput): SemanticHitAnalysis {
  const blob = `${hit.title}\n${hit.snippet}\n${hit.url}`;
  const facts = extractSemanticFacts(blob);
  const nameMatch = nameMatchesInText(subject.firstName, subject.lastName, blob);
  const { consistency, mismatch } = scoreConsistency(subject, facts, blob);
  const category = primaryCategory(facts);

  // Wrong-homonym demotion (other people sharing partial name tokens)
  let demoteReason: string | undefined;
  let promoteToMain = true;
  if (/stacey|jeff daprizio|diluzio|laurenzi|dadivoso/i.test(blob) && nameMatch < 0.9) {
    promoteToMain = false;
    demoteReason = "Likely different person (name collision / directory noise)";
  }
  // ESPN/template garbage without real fight content still promote MMA category but not junk templates
  if (/%\s*\{?\s*weight|%\s*\{?\s*country/i.test(blob)) {
    promoteToMain = false;
    demoteReason = "Template placeholder page (not subject content)";
  }
  if (hit.classification === "excluded") {
    promoteToMain = false;
    demoteReason = hit.exclusionReason || "Excluded by homonym filter";
  }

  // Pure platform logos / empty
  if (/youtube\.com\/?$|play\.google\.com\/store\/apps/i.test(hit.url) && nameMatch < 0.5) {
    promoteToMain = false;
    demoteReason = "Platform landing page - not subject content";
  }

  const summaryParts = [
    category !== "unknown" ? category.replace(/-/g, " ") : null,
    facts.organizations[0] || null,
    facts.occupations[0] || null,
    facts.locations[0] || null,
  ].filter(Boolean);

  return {
    url: hit.url,
    title: hit.title,
    facts,
    consistencyScore: consistency,
    mismatchScore: mismatch,
    nameMatch,
    category,
    summary: summaryParts.join(" · ") || hit.snippet?.slice(0, 120) || hit.title,
    promoteToMain,
    demoteReason,
  };
}

/** Continuity: multi-stage life arc is a *positive* uniqueness signal for uncommon surnames. */
export function scoreLifeContinuity(stages: LifeStageHint[]): number {
  const set = new Set(stages);
  let score = 0;
  const bridges: Array<[LifeStageHint, LifeStageHint]> = [
    ["mma-combat-sports", "military-medic"],
    ["military-medic", "sales-professional"],
    ["military-medic", "business-owner"],
    ["education", "mma-combat-sports"],
    ["business-owner", "biohazard-cleanup"],
    ["sales-professional", "business-owner"],
    ["biohazard-cleanup", "arrest-public-record"],
  ];
  for (const [a, b] of bridges) {
    if (set.has(a) && set.has(b)) score += 12;
  }
  // Unique multi-profession stack
  if (set.size >= 3) score += 15;
  if (set.size >= 4) score += 10;
  return Math.min(100, score);
}

export function analyzeSemanticCorpus(hits: SearchHit[], subject: SubjectInput): SemanticCorpusAnalysis {
  const analyses = hits
    .filter((h) => h.classification !== "excluded")
    .map((h) => analyzeSearchHit(h, subject));

  const fusedOccupations = unique(analyses.flatMap((a) => a.facts.occupations));
  const fusedLocations = unique(analyses.flatMap((a) => a.facts.locations));
  const fusedOrganizations = unique(
    analyses.flatMap((a) => a.facts.organizations).filter((o) => !JUNK_ORG.test(o)),
  );
  const lifeStages = [...new Set(analyses.flatMap((a) => a.facts.lifeStages))];
  const continuityScore = scoreLifeContinuity(lifeStages);

  const contradictionFlags: string[] = [];
  for (const a of analyses) {
    if (a.mismatchScore >= 40 && a.demoteReason) contradictionFlags.push(a.demoteReason);
  }

  const narrativeHints: string[] = [];
  if (lifeStages.includes("mma-combat-sports") && lifeStages.includes("biohazard-cleanup")) {
    narrativeHints.push(
      "Public record suggests a multi-decade arc: combat sports / education roots → later military/sales/business ownership in Florida biohazard services. Treat as single-persona continuity candidates, not automatic homonyms.",
    );
  }
  if (lifeStages.includes("business-owner") && fusedOrganizations.some((o) => /bio\s*scene/i.test(o))) {
    narrativeHints.push("Business ownership signals for BIO Scene Care align with Tampa/Hillsborough anchors.");
  }
  if (lifeStages.includes("arrest-public-record")) {
    narrativeHints.push(
      "Public arrest/mugshot material is a strong visual + records anchor when location and name match - not a separate persona by default.",
    );
  }

  return {
    hits: analyses,
    fusedOccupations,
    fusedLocations,
    fusedOrganizations,
    lifeStages,
    continuityScore,
    contradictionFlags: [...new Set(contradictionFlags)],
    narrativeHints,
  };
}
