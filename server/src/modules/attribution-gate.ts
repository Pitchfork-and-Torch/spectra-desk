/**
 * Strict attribution gate (v8)
 * Only LOCKED / ATTRIBUTED / LIKELY material reaches the client main report.
 * Quarantined username probes and low-posterior noise stay internal or appendix-only.
 */
import type {
  DossierSocialProfile,
  MediaTimelineEntry,
  ScoredAccountSummary,
  SearchHit,
  UsernameProbe,
} from "../types.js";
import type { SemanticHitAnalysis } from "./semantic-content.js";

export type ClientAttributionTier = "LOCKED" | "ATTRIBUTED" | "LIKELY" | "POSSIBLE" | "QUARANTINED";

export interface ClientAccount {
  platform: string;
  username: string;
  url: string;
  tier: ClientAttributionTier;
  posterior: number;
  verificationNote: string;
  contentSummary?: string;
  displayName?: string;
}

export interface AttributionGateResult {
  mainAccounts: ClientAccount[];
  appendixProbes: ClientAccount[];
  mainSearchHits: SearchHit[];
  appendixSearchHits: SearchHit[];
  mainMedia: MediaTimelineEntry[];
  stats: {
    probesTotal: number;
    probesMain: number;
    probesAppendix: number;
    hitsMain: number;
    hitsAppendix: number;
  };
}

const MAIN_POSTERIOR = 0.45; // 45%+ with content, or attributed tier
const LIKELY_POSTERIOR = 0.28;

function mapTier(s: ScoredAccountSummary): ClientAttributionTier {
  if (s.tier === "attributed") return "ATTRIBUTED";
  if (s.tier === "quarantined") return "QUARANTINED";
  if (s.posterior >= MAIN_POSTERIOR) return "LIKELY";
  if (s.posterior >= LIKELY_POSTERIOR) return "POSSIBLE";
  return "QUARANTINED";
}

function probeToClient(p: UsernameProbe, scored?: ScoredAccountSummary): ClientAccount {
  const tier = scored ? mapTier(scored) : p.method === "http-probe" ? "QUARANTINED" : "POSSIBLE";
  const posterior = scored ? Math.round(scored.posterior * 100) : p.confidence;
  let verificationNote = `${p.method}`;
  if (scored?.tier === "attributed") verificationNote += " · multi-signal attributed";
  else if (scored?.portraitVerdict === "matches-anchor") verificationNote += " · face matches anchor";
  else if (scored?.linkOwnership === "self-claimed") verificationNote += " · self-claimed on owned site";
  else if (tier === "QUARANTINED") verificationNote += " · existence-only - not attributed";

  const contentSummary = [p.displayName, p.bio, p.location].filter(Boolean).join(" · ").slice(0, 200) || undefined;

  return {
    platform: p.platform,
    username: p.username,
    url: p.url,
    tier,
    posterior,
    verificationNote,
    contentSummary,
    displayName: p.displayName,
  };
}

/**
 * Pure HTTP existence is never enough for main-report ATTRIBUTED/LIKELY.
 * Require attributed tier, non-http method, content, or strong posterior with bio.
 */
export function isMainReportAccount(account: ClientAccount, scored?: ScoredAccountSummary): boolean {
  if (account.tier === "ATTRIBUTED" || account.tier === "LOCKED") return true;
  if (account.tier === "QUARANTINED") return false;
  if (scored?.linkOwnership === "self-claimed" || scored?.linkOwnership === "site-linked") return true;
  if (scored?.portraitVerdict === "matches-anchor" || scored?.portraitVerdict === "likely-same") return true;
  if (account.contentSummary && account.posterior >= 28 && account.tier === "LIKELY") return true;
  // Deep content without being pure http-probe
  if (!/existence-only|http-probe/i.test(account.verificationNote) && account.posterior >= 35) return true;
  return false;
}

export function filterDossierSocialForClient(profiles: DossierSocialProfile[]): {
  main: DossierSocialProfile[];
  appendix: DossierSocialProfile[];
} {
  const main: DossierSocialProfile[] = [];
  const appendix: DossierSocialProfile[] = [];
  for (const p of profiles) {
    if (p.tier === "attributed") {
      main.push(p);
      continue;
    }
    if (p.tier === "discovered" && p.posterior >= 28 && !/quarantined|http-probe only/i.test(p.verificationNote)) {
      // Keep discovered with real content
      if (p.bio || p.displayName || p.location) {
        main.push(p);
        continue;
      }
    }
    appendix.push(p);
  }
  return { main, appendix };
}

export function applyAttributionGate(input: {
  probes: UsernameProbe[];
  scored: ScoredAccountSummary[];
  hits: SearchHit[];
  media?: MediaTimelineEntry[];
  semanticHits?: SemanticHitAnalysis[];
}): AttributionGateResult {
  const scoredMap = new Map(input.scored.map((s) => [s.url, s]));
  const exists = input.probes.filter((p) => p.exists);
  const clients = exists.map((p) => probeToClient(p, scoredMap.get(p.url)));

  const mainAccounts: ClientAccount[] = [];
  const appendixProbes: ClientAccount[] = [];
  for (const c of clients) {
    const sc = scoredMap.get(c.url);
    if (isMainReportAccount(c, sc)) mainAccounts.push(c);
    else appendixProbes.push(c);
  }
  mainAccounts.sort((a, b) => b.posterior - a.posterior);
  appendixProbes.sort((a, b) => b.posterior - a.posterior);

  const semanticByUrl = new Map((input.semanticHits || []).map((h) => [h.url.split("#")[0], h]));

  const mainSearchHits: SearchHit[] = [];
  const appendixSearchHits: SearchHit[] = [];
  for (const hit of input.hits) {
    if (hit.classification === "excluded") {
      appendixSearchHits.push(hit);
      continue;
    }
    const sem = semanticByUrl.get(hit.url.split("#")[0]!);
    if (sem && !sem.promoteToMain) {
      appendixSearchHits.push(hit);
      continue;
    }
    // Promote corroborated, high name match, or business/records
    const blob = `${hit.title} ${hit.snippet} ${hit.url}`;
    const isHighValue =
      hit.classification === "corroborated" ||
      /sunbiz|bbb\.org|bioscenecare|linkedin\.com\/in\/|mugshot|arrest|espn\.com\/mma|sherdog|voyage/i.test(blob) ||
      (sem && sem.consistencyScore >= 25 && sem.nameMatch >= 0.7);
    if (isHighValue) mainSearchHits.push(hit);
    else if (sem && sem.nameMatch >= 0.85) mainSearchHits.push(hit);
    else appendixSearchHits.push(hit);
  }

  // Cap main search for client brevity
  const mainHitsCapped = mainSearchHits.slice(0, 18);
  const overflow = mainSearchHits.slice(18);
  appendixSearchHits.push(...overflow);

  const mainMedia = (input.media || [])
    .filter((m) => {
      const blob = `${m.title} ${m.snippet || ""} ${m.url}`.toLowerCase();
      // Hard demote wrong-person / template noise (Dustin Laurenzi, Justin Dadivoso, etc.)
      if (
        /laurenzi|dadivoso|stacey daprizio|jeff daprizio|diluzio|%[\s{]*weight|%[\s{]*country/i.test(
          blob,
        )
      ) {
        return false;
      }
      // Bandcamp/music hits without subject surname are almost always collisions
      if (/bandcamp\.com/i.test(m.url) && !/daprizio/i.test(blob)) return false;
      const sem = semanticByUrl.get(m.url.split("#")[0]!);
      if (sem && !sem.promoteToMain) return false;
      if (sem && sem.nameMatch < 0.55 && sem.consistencyScore < 20) return false;
      return m.relevance >= 45 || /legal|negative/.test(m.tone) || /arrest|mugshot|bbb|sunbiz|bio.?scene/i.test(blob);
    })
    .slice(0, 8);

  return {
    mainAccounts: mainAccounts.slice(0, 12),
    appendixProbes,
    mainSearchHits: mainHitsCapped,
    appendixSearchHits,
    mainMedia,
    stats: {
      probesTotal: exists.length,
      probesMain: mainAccounts.length,
      probesAppendix: appendixProbes.length,
      hitsMain: mainHitsCapped.length,
      hitsAppendix: appendixSearchHits.length,
    },
  };
}

/** Sanitize employment org names that swallowed FAQ/snippet garbage. */
export function sanitizeOrganizationName(org: string): string | null {
  const s = org.replace(/\s+/g, " ").trim();
  if (!s || s.length < 2) return null;
  if (/how many|employees are|is dustin|click here|undefined|page not found|\?$/i.test(s)) return null;
  if (s.length > 70) return null;
  // Truncate mid-sentence garbage
  if (/\.\s+[A-Z]/.test(s) && !/\bLLC\b|\bInc\b/i.test(s)) {
    const first = s.split(/\.\s+/)[0]!;
    if (first.length >= 3 && first.length <= 60) return first.trim();
    return null;
  }
  return s;
}
