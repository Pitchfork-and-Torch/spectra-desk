/**
 * Spectra Desk v9 Corroborate.
 * Matrix, claim ledger, human LOCK, Merkle seal.
 * The machine does not LOCK.
 */
import { sha256 } from "../hash.js";
import type { EvidenceItem, OsintReport, SearchHit } from "../types.js";

export type ConfidenceBand = "high" | "medium" | "low" | "insufficient" | "cannot-tell";

export interface AnchorCell {
  kind: "name" | "email" | "username" | "employer" | "business" | "life-arc";
  value: string;
  present: boolean;
}

export interface MatrixRow {
  id: string;
  label: string;
  role: "candidate" | "homonym";
  anchors: AnchorCell[];
  anchorCount: number;
  band: ConfidenceBand;
  dropReason?: string;
  promotedToBrief: boolean;
}

export interface CorroborationMatrix {
  rows: MatrixRow[];
  mergeRefused: boolean;
  mergeReason?: string;
  promoted: number;
  heldOnWorkbench: number;
}

export interface ClaimRow {
  id: string;
  sentence: string;
  sourceUrl: string;
  capturedAt: string;
  sha256: string;
  band: ConfidenceBand;
  survivesBrief: boolean;
}

export interface ClaimLedger {
  rows: ClaimRow[];
  algorithm: "SHA-256";
}

export interface MerkleSeal {
  algorithm: "merkle-sha256";
  leafCount: number;
  root: string | null;
  pendingHumanLock: boolean;
}

function bandFor(anchorCount: number, homonymRisk: string, contradictions: number, locked: boolean): ConfidenceBand {
  if (contradictions > 0 && anchorCount < 3) return "cannot-tell";
  if (homonymRisk === "high" && anchorCount < 3) return "cannot-tell";
  if (anchorCount <= 0) return "insufficient";
  if (locked || anchorCount >= 3) return "high";
  if (anchorCount === 2) return "medium";
  return "low";
}

function cells(report: OsintReport): AnchorCell[] {
  const s = report.subject;
  const name = [s.firstName, s.lastName].filter(Boolean).join(" ");
  const business = report.businessEntities?.find((b) => b.strength !== "weak")?.legalName || "";
  const life = report.lifeTimeline?.narrativeArc ? "life-arc present" : "";
  return [
    { kind: "name", value: name, present: Boolean(name) },
    { kind: "email", value: s.email || "", present: Boolean(s.email) },
    { kind: "username", value: s.username || "", present: Boolean(s.username) },
    { kind: "employer", value: s.employer || "", present: Boolean(s.employer) },
    { kind: "business", value: business, present: Boolean(business) },
    { kind: "life-arc", value: life, present: Boolean(life) },
  ];
}

function homonymRow(hit: SearchHit, index: number): MatrixRow {
  return {
    id: `homonym-${index + 1}`,
    label: hit.title || hit.url,
    role: "homonym",
    anchors: [],
    anchorCount: 0,
    band: "cannot-tell",
    dropReason: hit.exclusionReason || "Same name, different life",
    promotedToBrief: false,
  };
}

export function buildCorroborationMatrix(report: OsintReport): CorroborationMatrix {
  const anchors = cells(report);
  const anchorCount = anchors.filter((a) => a.present).length;
  const contradictions = report.identityLock?.contradictions.length || 0;
  const locked = report.identityLock?.status === "locked" && report.identityLock.lockedBy === "operator";
  const band = bandFor(anchorCount, report.disambiguation?.homonymRisk || "medium", contradictions, locked);
  const primary: MatrixRow = {
    id: "candidate-primary",
    label: anchors.find((a) => a.kind === "name")?.value || report.subject.username || report.subject.email || "Unnamed intake",
    role: "candidate",
    anchors,
    anchorCount,
    band,
    promotedToBrief: band === "high",
  };
  const homonyms = (report.excludedHits || []).slice(0, 8).map(homonymRow);
  const employers = new Set(
    [report.subject.employer, ...(report.businessEntities || []).map((b) => b.legalName)]
      .map((v) => (v || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const mergeRefused = employers.size > 1 && contradictions > 0;
  return {
    rows: [primary, ...homonyms],
    mergeRefused,
    mergeReason: mergeRefused ? "Anchors conflict. Identities stay split until a person confirms a merge." : undefined,
    promoted: primary.promotedToBrief ? 1 : 0,
    heldOnWorkbench: homonyms.length + (primary.promotedToBrief ? 0 : 1),
  };
}

export function buildClaimLedger(report: OsintReport, matrix: CorroborationMatrix): ClaimLedger {
  const primaryBand = matrix.rows[0]?.band || "insufficient";
  const rows: ClaimRow[] = (report.evidence || []).map((item) => ({
    id: item.id,
    sentence: `${item.title}${item.excerpt ? `. ${item.excerpt}` : ""}`.slice(0, 500),
    sourceUrl: item.url,
    capturedAt: item.capturedAt,
    sha256: item.hash || sha256(`${item.url}|${item.title}|${item.excerpt}`),
    band: primaryBand,
    survivesBrief: primaryBand === "high" || primaryBand === "medium",
  }));
  if (rows.length === 0 && report.executiveSummary) {
    const sentence = report.executiveSummary.replace(/\*\*/g, "").slice(0, 500);
    rows.push({
      id: "claim-summary",
      sentence,
      sourceUrl: "intake://operator",
      capturedAt: report.createdAt,
      sha256: sha256(sentence),
      band: primaryBand,
      survivesBrief: true,
    });
  }
  return { rows, algorithm: "SHA-256" };
}

export function merkleRoot(hashes: string[]): string {
  const leaves = hashes.filter(Boolean).sort();
  if (leaves.length === 0) return sha256("");
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(sha256(left + right));
    }
    level = next;
  }
  return level[0]!;
}

export function sealFor(report: OsintReport, ledger: ClaimLedger): MerkleSeal {
  const locked = report.identityLock?.status === "locked" && report.identityLock.lockedBy === "operator";
  if (!locked) {
    return { algorithm: "merkle-sha256", leafCount: ledger.rows.length, root: null, pendingHumanLock: true };
  }
  return {
    algorithm: "merkle-sha256",
    leafCount: ledger.rows.length,
    root: merkleRoot(ledger.rows.map((row) => row.sha256)),
    pendingHumanLock: false,
  };
}

export function recaptureDiff(previousHash: string, body: string): { previousHash: string; nextHash: string; changed: boolean } {
  const nextHash = sha256(body);
  return { previousHash, nextHash, changed: previousHash !== nextHash };
}

export async function checkLinkRot(url: string): Promise<{ url: string; status: number | "error"; stale: boolean }> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
    return { url, status: res.status, stale: res.status >= 400 };
  } catch {
    return { url, status: "error", stale: true };
  }
}

export function attachCorroborate(report: OsintReport): OsintReport {
  const corroboration = buildCorroborationMatrix(report);
  const claimLedger = buildClaimLedger(report, corroboration);
  report.corroboration = corroboration;
  report.claimLedger = claimLedger;
  report.merkleSeal = sealFor(report, claimLedger);
  report.briefTemplate = report.briefTemplate || "client";
  return report;
}

/** Human action only. Callers must be the desk UI or an operator-typed CLI flag. */
export function applyHumanLock(report: OsintReport, when = new Date().toISOString()): OsintReport {
  if (!report.identityLock) {
    report.identityLock = {
      status: "locked",
      score: report.disambiguation?.score || 0,
      structuralScore: 0,
      contentScore: 0,
      visualScore: 0,
      signalClasses: [],
      contradictions: [],
      nextActions: [],
      rationale: ["Operator confirmed LOCKED."],
      lockedAt: when,
      lockedBy: "operator",
    };
  } else {
    report.identityLock.status = "locked";
    report.identityLock.lockedAt = when;
    report.identityLock.lockedBy = "operator";
    report.identityLock.rationale = [...report.identityLock.rationale, "Operator confirmed LOCKED."];
  }
  if (report.dossier) report.dossier.identityLocked = true;
  attachCorroborate(report);
  return report;
}

export function ledgerMarkdown(report: OsintReport): string {
  const ledger = report.claimLedger;
  const matrix = report.corroboration;
  const lines = ["## Claim ledger", ""];
  if (!ledger) return lines.concat(["No ledger on this case.", ""]).join("\n");
  for (const row of ledger.rows) {
    lines.push(`- ${row.sentence}`);
    lines.push(`  - source: ${row.sourceUrl}`);
    lines.push(`  - captured: ${row.capturedAt}`);
    lines.push(`  - sha256: ${row.sha256}`);
    lines.push(`  - band: ${row.band}`);
    lines.push("");
  }
  if (matrix?.mergeRefused) lines.push(`Merge refused. ${matrix.mergeReason}`, "");
  if (report.merkleSeal?.pendingHumanLock) lines.push("Merkle seal waits for a human LOCK.", "");
  else if (report.merkleSeal?.root) lines.push(`Merkle root: ${report.merkleSeal.root}`, "");
  return lines.join("\n");
}

export function evidenceHash(item: Pick<EvidenceItem, "url" | "title" | "excerpt">): string {
  return sha256(`${item.url}|${item.title}|${item.excerpt}`);
}
