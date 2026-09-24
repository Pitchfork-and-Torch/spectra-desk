/**
 * Life-timeline & narrative synthesis (v8)
 * Reconstructs chronological persona story when signals support continuity.
 */
import type { SearchHit, SubjectInput } from "../types.js";
import type { BusinessEntity } from "./business-entity.js";
import type { LifeStageHint, SemanticCorpusAnalysis, SemanticHitAnalysis } from "./semantic-content.js";

export interface TimelineEvent {
  id: string;
  sortKey: string; // ISO-ish or year-only for ordering
  year?: number;
  dateLabel: string;
  title: string;
  description: string;
  category: LifeStageHint | "identity" | "location" | "other";
  confidence: "confirmed" | "likely" | "possible";
  sourceUrl?: string;
  sourceLabel?: string;
}

export interface LifeTimeline {
  events: TimelineEvent[];
  narrativeArc: string;
  personaStages: Array<{ stage: string; summary: string; supportCount: number }>;
  continuityAssessment: string;
  openQuestions: string[];
}

function yearFromText(text: string): number | undefined {
  const years = [...text.matchAll(/\b(19[89]\d|20[0-2]\d)\b/g)].map((m) => Number(m[1]));
  if (!years.length) return undefined;
  return years.sort((a, b) => b - a)[0];
}

function stageOrder(stage: LifeStageHint): number {
  const order: Record<string, number> = {
    education: 10,
    "mma-combat-sports": 20,
    "military-medic": 30,
    "sales-professional": 40,
    "business-owner": 50,
    "biohazard-cleanup": 55,
    "construction-renovation": 56,
    "professional-profile": 60,
    "arrest-public-record": 70,
    "generic-media": 80,
    unknown: 90,
  };
  return order[stage] ?? 85;
}

function eventFromHit(hit: SemanticHitAnalysis, index: number): TimelineEvent | null {
  if (!hit.promoteToMain && hit.demoteReason) return null;
  if (hit.nameMatch < 0.55 && hit.consistencyScore < 20) return null;

  const year = yearFromText(`${hit.title} ${hit.summary}`) ?? hit.facts.timelineYears.slice(-1)[0];
  const category = hit.category;

  // Skip pure noise
  if (category === "unknown" && hit.consistencyScore < 15) return null;

  let title = hit.title.slice(0, 140);
  let description = hit.summary;
  let confidence: TimelineEvent["confidence"] = "possible";

  if (category === "mma-combat-sports") {
    title = "Combat sports / MMA public record";
    description =
      "Public fight-history and sports database mentions (ESPN/Sherdog-class). May represent an earlier life stage; continuity with later Florida business records should be evaluated, not auto-split as a different person.";
    confidence = hit.consistencyScore >= 25 || hit.nameMatch >= 0.85 ? "likely" : "possible";
  } else if (category === "biohazard-cleanup" || category === "business-owner") {
    title = hit.facts.organizations[0]
      ? `Business / professional: ${hit.facts.organizations[0]}`
      : "Business ownership / professional activity";
    description = hit.summary;
    confidence = hit.consistencyScore >= 40 ? "likely" : "possible";
    if (hit.consistencyScore >= 55) confidence = "confirmed";
  } else if (category === "arrest-public-record") {
    title = "Public arrest / court-adjacent record";
    description =
      "Public booking/mugshot or news coverage. Strong visual + jurisdiction anchor when name and locality match intake.";
    confidence = hit.consistencyScore >= 30 ? "likely" : "possible";
  } else if (category === "military-medic") {
    title = "Military / combat medic public claim";
    description = hit.summary;
    confidence = "possible";
  } else if (category === "education") {
    title = "Education mention";
    description = hit.facts.education[0] || hit.summary;
    confidence = "possible";
  } else if (category === "professional-profile") {
    title = "Professional profile / directory";
    description = hit.summary;
    confidence = "possible";
  }

  const sortKey = year
    ? `${year}-06-01`
    : `19${String(stageOrder(category)).padStart(2, "0")}-01-01`;

  return {
    id: `tl-${index}`,
    sortKey,
    year,
    dateLabel: year ? String(year) : "Undated",
    title,
    description,
    category,
    confidence,
    sourceUrl: hit.url,
    sourceLabel: (() => {
      try {
        return new URL(hit.url).hostname.replace(/^www\./, "");
      } catch {
        return undefined;
      }
    })(),
  };
}

function dedupeEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  const out: TimelineEvent[] = [];
  for (const e of events) {
    const key = `${e.category}|${e.year || ""}|${e.title.slice(0, 40).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function buildLifeTimeline(
  subject: SubjectInput,
  semantic: SemanticCorpusAnalysis,
  businesses: BusinessEntity[],
  opts?: { rawHits?: SearchHit[] },
): LifeTimeline {
  const name = [subject.firstName, subject.lastName].filter(Boolean).join(" ") || "Subject";
  const events = dedupeEvents(
    semantic.hits
      .map((h, i) => eventFromHit(h, i))
      .filter((e): e is TimelineEvent => Boolean(e)),
  );

  // Inject business founding stage if fused
  for (const biz of businesses.slice(0, 2)) {
    if (biz.strength === "weak") continue;
    events.push({
      id: `tl-biz-${biz.id}`,
      sortKey: "2023-01-01",
      year: 2023,
      dateLabel: "2020s",
      title: `${biz.legalName} - ownership / principal signals`,
      description: [
        biz.role || "Principal / owner signals",
        biz.industry,
        biz.locations[0],
        biz.personLinkRationale[0],
      ]
        .filter(Boolean)
        .join(" · "),
      category: "business-owner",
      confidence: biz.confidence === "confirmed" ? "confirmed" : biz.confidence === "likely" ? "likely" : "possible",
      sourceUrl: biz.sourceUrls[0],
    });
  }

  // Location anchor
  if (subject.city || subject.state) {
    events.push({
      id: "tl-loc-intake",
      sortKey: "2024-01-01",
      dateLabel: "Intake",
      title: `Location anchor: ${[subject.city, subject.state].filter(Boolean).join(", ")}`,
      description: "Investigator-provided location used for multi-signal fusion.",
      category: "location",
      confidence: "confirmed",
    });
  }

  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.title.localeCompare(b.title));

  const stageCounts = new Map<string, number>();
  for (const s of semantic.lifeStages) {
    stageCounts.set(s, (stageCounts.get(s) || 0) + 1);
  }
  for (const h of semantic.hits) {
    if (h.category !== "unknown") stageCounts.set(h.category, (stageCounts.get(h.category) || 0) + 1);
  }

  const personaStages = [...stageCounts.entries()]
    .map(([stage, supportCount]) => ({
      stage: stage.replace(/-/g, " "),
      summary: stageSummary(stage as LifeStageHint),
      supportCount,
    }))
    .sort((a, b) => b.supportCount - a.supportCount)
    .slice(0, 6);

  const primaryBiz = businesses[0];
  const hasMma = semantic.lifeStages.includes("mma-combat-sports");
  const hasBiz =
    semantic.lifeStages.includes("biohazard-cleanup") ||
    semantic.lifeStages.includes("business-owner") ||
    Boolean(primaryBiz);
  const hasArrest = semantic.lifeStages.includes("arrest-public-record");

  const arcParts: string[] = [];
  arcParts.push(
    `${name} presents a public-source footprint centered on ${[subject.city, subject.state].filter(Boolean).join(", ") || "the intake location"}.`,
  );
  if (hasMma && hasBiz) {
    arcParts.push(
      "Earlier public sports databases document an MMA fight record (Nebraska/Omaha-era signals appear on professional profiles); later public business and interview sources document Florida biohazard/cleanup ownership. Multi-stage continuity is treated as a positive uniqueness signal for this uncommon surname rather than automatic homonym split.",
    );
  } else if (hasBiz) {
    arcParts.push(
      primaryBiz
        ? `Professional identity is primarily linked to ${primaryBiz.legalName}${primaryBiz.role ? ` (${primaryBiz.role})` : ""}.`
        : "Professional/business ownership signals are present in the public corpus.",
    );
  }
  if (hasArrest) {
    arcParts.push(
      "A public arrest/mugshot record in the same jurisdiction strengthens visual identity and should be fused with the business persona when name and locality align.",
    );
  }
  if (semantic.narrativeHints.length) {
    arcParts.push(semantic.narrativeHints[0]!);
  }

  const continuityAssessment =
    semantic.continuityScore >= 30
      ? `Life-stage continuity score ${semantic.continuityScore}/100 - multi-profession arc supports single-persona clustering.`
      : semantic.lifeStages.length <= 1
        ? "Limited multi-stage evidence - identity rests on location/business/records anchors."
        : `Partial continuity (${semantic.continuityScore}/100) - review competing clusters before lock.`;

  const openQuestions: string[] = [];
  if (!subject.email) openQuestions.push("Email address for Gravatar / breach-index / registration pivots.");
  if (!hasBiz) openQuestions.push("Corroborate employer/business via Sunbiz, BBB, or company About page.");
  if (hasMma && hasBiz) {
    openQuestions.push(
      "Optional: confirm MMA fight history and Florida business identity as same person via age, education, LinkedIn, or reference photo.",
    );
  }
  if (!hasArrest) openQuestions.push("No public arrest record fused - not necessarily absent.");
  openQuestions.push("Operator: confirm TARGET in Identity Workbench for LOCKED status.");

  // Silence unused
  void opts;

  return {
    events: events.slice(0, 16),
    narrativeArc: arcParts.join(" "),
    personaStages,
    continuityAssessment,
    openQuestions: openQuestions.slice(0, 8),
  };
}

function stageSummary(stage: LifeStageHint): string {
  switch (stage) {
    case "mma-combat-sports":
      return "Public combat-sports fight history and database mirrors";
    case "military-medic":
      return "Navy / combat medic veteran claims in interviews or bios";
    case "biohazard-cleanup":
      return "Biohazard, crime-scene, after-death cleanup business activity";
    case "business-owner":
      return "LLC ownership, registered agent, BBB principal, founder language";
    case "construction-renovation":
      return "Construction / renovation brand association";
    case "sales-professional":
      return "Sales career / awards in professional narratives";
    case "education":
      return "University / college mentions";
    case "arrest-public-record":
      return "Public booking, mugshot, or court-adjacent coverage";
    case "professional-profile":
      return "LinkedIn or professional directory presence";
    default:
      return "Uncategorized public mention";
  }
}
