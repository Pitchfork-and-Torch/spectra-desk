/**
 * Persona / life-stage clustering (v8)
 * Groups accounts + semantic stages into coherent personas (not just music/dev/gamer).
 */
import type { ScoredAccount } from "./account-scoring.js";
import type { SiteFingerprint } from "./website-profiler.js";
import type { LifeStageHint, SemanticCorpusAnalysis } from "./semantic-content.js";
import type { BusinessEntity } from "./business-entity.js";

export type PersonaLabel =
  | "music-professional"
  | "developer"
  | "streamer-gamer"
  | "self-attested"
  | "unverified"
  | "business-owner"
  | "biohazard-operator"
  | "mma-athlete"
  | "military-veteran"
  | "sales-professional"
  | "public-records-subject"
  | "life-arc-primary";

export interface PersonaCluster {
  id: string;
  label: PersonaLabel;
  description: string;
  accounts: ScoredAccount[];
  confidence: number;
  lifeStages?: LifeStageHint[];
  supportingUrls?: string[];
  competing?: boolean;
}

export function buildPersonaClusters(
  scored: ScoredAccount[],
  siteFp?: SiteFingerprint,
  opts?: {
    semantic?: SemanticCorpusAnalysis;
    businesses?: BusinessEntity[];
  },
): PersonaCluster[] {
  const clusters: PersonaCluster[] = [];
  const semantic = opts?.semantic;
  const businesses = opts?.businesses || [];

  // --- v8 Primary life-arc cluster when multi-stage continuity exists ---
  if (semantic && semantic.continuityScore >= 20 && semantic.lifeStages.length >= 2) {
    const attributed = scored.filter((a) => a.tier === "attributed" || a.tier === "discovered");
    clusters.push({
      id: "persona:life-arc-primary",
      label: "life-arc-primary",
      description:
        "Primary persona: multi-stage public life arc (e.g. education/sports → military/career → Florida business). Continuity treated as positive uniqueness signal for uncommon surnames.",
      accounts: attributed,
      confidence: Math.min(95, 55 + Math.round(semantic.continuityScore * 0.4)),
      lifeStages: semantic.lifeStages,
      supportingUrls: semantic.hits
        .filter((h) => h.promoteToMain && h.nameMatch >= 0.7)
        .slice(0, 8)
        .map((h) => h.url),
      competing: false,
    });
  }

  if (businesses.some((b) => b.strength === "attributed" || b.strength === "likely")) {
    const primary = businesses[0]!;
    clusters.push({
      id: "persona:business-owner",
      label: "business-owner",
      description: `Business principal cluster: ${primary.legalName}${primary.industry ? ` - ${primary.industry}` : ""}`,
      accounts: scored.filter((a) => a.tier !== "quarantined"),
      confidence: primary.strength === "attributed" ? 90 : 75,
      lifeStages: ["business-owner", "biohazard-cleanup"].filter((s) =>
        semantic?.lifeStages.includes(s as LifeStageHint),
      ) as LifeStageHint[],
      supportingUrls: primary.sourceUrls.slice(0, 6),
    });
  }

  if (semantic?.lifeStages.includes("mma-combat-sports")) {
    clusters.push({
      id: "persona:mma",
      label: "mma-athlete",
      description:
        "Combat-sports public record cluster (ESPN/Sherdog-class). Default: merge into primary life-arc when surname is uncommon and later-career Florida signals exist - do not rank as top-level noise.",
      accounts: [],
      confidence: 70,
      lifeStages: ["mma-combat-sports"],
      supportingUrls: semantic.hits
        .filter((h) => h.category === "mma-combat-sports")
        .slice(0, 4)
        .map((h) => h.url),
      competing: semantic.continuityScore < 15,
    });
  }

  if (semantic?.lifeStages.includes("military-medic")) {
    clusters.push({
      id: "persona:military",
      label: "military-veteran",
      description: "Military / combat medic public claims (interview or bio)",
      accounts: [],
      confidence: 65,
      lifeStages: ["military-medic"],
    });
  }

  if (semantic?.lifeStages.includes("arrest-public-record")) {
    clusters.push({
      id: "persona:public-records",
      label: "public-records-subject",
      description: "Public arrest/booking/mugshot cluster - visual + jurisdiction anchor when locality matches",
      accounts: [],
      confidence: 80,
      lifeStages: ["arrest-public-record"],
      supportingUrls: semantic.hits
        .filter((h) => h.category === "arrest-public-record")
        .slice(0, 3)
        .map((h) => h.url),
    });
  }

  const selfAttested = scored.filter((a) => a.evidence.some((e) => e.id === "self-published"));
  if (selfAttested.length) {
    clusters.push({
      id: "persona:self-attested",
      label: "self-attested",
      description: "Accounts linked from owned website or rel=me",
      accounts: selfAttested,
      confidence: 92,
    });
  }

  const dev = scored.filter(
    (a) => a.platform === "GitHub" || a.platform === "GitLab" || a.platform === "npm",
  );
  if (dev.length) {
    clusters.push({
      id: "persona:developer",
      label: "developer",
      description: "Developer / code persona",
      accounts: dev,
      confidence: dev[0]?.posterior ? Math.round(dev[0].posterior * 100) : 80,
    });
  }

  const music = scored.filter((a) =>
    ["YouTube", "Bandcamp", "SoundCloud", "ReverbNation", "Spotify"].includes(a.platform),
  );
  if (music.length || siteFp?.professionPhrases.length) {
    clusters.push({
      id: "persona:music",
      label: "music-professional",
      description: "Music / creative professional persona",
      accounts: music,
      confidence: 85,
    });
  }

  const stream = scored.filter((a) => ["Twitch", "Steam"].includes(a.platform) && a.tier !== "quarantined");
  if (stream.length) {
    clusters.push({
      id: "persona:streamer",
      label: "streamer-gamer",
      description: "Streaming / gaming persona (may use different moniker)",
      accounts: stream,
      confidence: Math.round((stream[0]?.posterior || 0.5) * 100),
    });
  }

  // Quarantined mass - single low-confidence cluster, never primary
  const quarantined = scored.filter((a) => a.tier === "quarantined");
  if (quarantined.length) {
    clusters.push({
      id: "persona:unverified",
      label: "unverified",
      description: `${quarantined.length} weak HTTP-only username matches - not attributed; client report omits these`,
      accounts: quarantined,
      confidence: 15,
      competing: false,
    });
  }

  return clusters;
}
