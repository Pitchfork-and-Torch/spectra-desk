import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { OsintReport, PortraitCandidate, SubjectInput } from "../types.js";

const HISTORY_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || ".",
  ".spectra-desk",
  "subject-history.json",
);

export interface PortraitMemoryEntry {
  dHash: string;
  assignment: "subject" | "homonym" | "reject";
  label: string;
  platform?: string;
  profileUrl?: string;
  lastSeenAt: string;
}

export interface SubjectHistoryEntry {
  subjectKey: string;
  firstName: string;
  lastName: string;
  runs: Array<{
    reportId: string;
    completedAt: string;
    score: number;
    mode?: string;
    searchHitCount: number;
    portraitCount: number;
  }>;
  portraitMemory: PortraitMemoryEntry[];
  excludedUrls: string[];
  searchLog: string[];
  anchorDHash?: string;
  confirmedTargetId?: string;
  confirmedTargetLabel?: string;
  updatedAt: string;
}

export interface SubjectHistoryHint {
  priorRunCount: number;
  lastRunAt?: string;
  lastReportId?: string;
  cachedPortraitCount: number;
  cachedExclusionCount: number;
  message: string;
}

function ensureStore(): string {
  const dir = path.dirname(HISTORY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return HISTORY_PATH;
}

export function subjectKey(first?: string, last?: string): string {
  return `${(first || "").trim().toLowerCase()}|${(last || "").trim().toLowerCase()}`;
}

function loadAll(): SubjectHistoryEntry[] {
  try {
    return JSON.parse(readFileSync(ensureStore(), "utf8")) as SubjectHistoryEntry[];
  } catch {
    return [];
  }
}

function saveAll(entries: SubjectHistoryEntry[]) {
  writeFileSync(ensureStore(), JSON.stringify(entries.slice(-200), null, 2), "utf8");
}

export function lookupSubjectHistory(first?: string, last?: string): SubjectHistoryEntry | null {
  const key = subjectKey(first, last);
  if (!key || key === "|") return null;
  return loadAll().find((e) => e.subjectKey === key) || null;
}

export function subjectHistoryHint(first?: string, last?: string): SubjectHistoryHint | null {
  const entry = lookupSubjectHistory(first, last);
  if (!entry || !entry.runs.length) return null;
  const latestRun = entry.runs[entry.runs.length - 1]!;
  return {
    priorRunCount: entry.runs.length,
    lastRunAt: latestRun.completedAt,
    lastReportId: latestRun.reportId,
    cachedPortraitCount: entry.portraitMemory.length,
    cachedExclusionCount: entry.excludedUrls.length,
    message: `Processed ${entry.runs.length} time(s) before - reusing ${entry.portraitMemory.length} portrait label(s) and ${entry.excludedUrls.length} exclusion(s).`,
  };
}

export function getHistoryExclusions(first?: string, last?: string): string[] {
  return lookupSubjectHistory(first, last)?.excludedUrls || [];
}

/** Apply stored dHash assignments onto fresh portrait candidates. */
export function applyPortraitMemory(
  candidates: PortraitCandidate[],
  memory: PortraitMemoryEntry[],
): PortraitCandidate[] {
  if (!memory.length) return candidates;
  const byHash = new Map(memory.map((m) => [m.dHash, m]));
  return candidates.map((c) => {
    if (!c.dHash) return c;
    const mem = byHash.get(c.dHash);
    if (!mem) return { ...c, userAssignment: c.userAssignment || "pending" };
    const matchVerdict =
      mem.assignment === "subject"
        ? "matches-anchor"
        : mem.assignment === "homonym"
          ? "distinct-person"
          : c.matchVerdict;
    return {
      ...c,
      userAssignment: mem.assignment,
      matchVerdict,
      role: mem.assignment === "subject" ? "anchor" : mem.assignment === "homonym" ? "homonym" : c.role,
    };
  });
}

export function recordSubjectHistory(report: OsintReport): void {
  const { subject } = report;
  const key = subjectKey(subject.firstName, subject.lastName);
  if (!key || key === "|") return;

  const all = loadAll();
  let entry = all.find((e) => e.subjectKey === key);
  if (!entry) {
    entry = {
      subjectKey: key,
      firstName: subject.firstName || "",
      lastName: subject.lastName || "",
      runs: [],
      portraitMemory: [],
      excludedUrls: [],
      searchLog: [],
      updatedAt: new Date().toISOString(),
    };
    all.push(entry);
  }

  entry.firstName = subject.firstName || "";
  entry.lastName = subject.lastName || "";
  entry.updatedAt = new Date().toISOString();

  if (report.completedAt) {
    entry.runs = entry.runs.filter((r) => r.reportId !== report.id);
    entry.runs.push({
      reportId: report.id,
      completedAt: report.completedAt,
      score: report.disambiguation?.score ?? 0,

      searchHitCount: report.searchHits?.length ?? 0,
      portraitCount: report.portraitIntel?.candidates.length ?? 0,
    });
    entry.runs = entry.runs.slice(-20);
  }

  const queries = [...new Set((report.searchHits || []).map((h) => h.query).filter(Boolean))];
  entry.searchLog = [...new Set([...entry.searchLog, ...queries])].slice(-48);

  for (const hit of report.excludedHits || []) {
    const url = hit.url.split("#")[0];
    if (!entry.excludedUrls.includes(url)) entry.excludedUrls.push(url);
  }
  entry.excludedUrls = entry.excludedUrls.slice(-100);

  if (report.portraitIntel?.anchorPortrait?.dHash) {
    entry.anchorDHash = report.portraitIntel.anchorPortrait.dHash;
  }

  for (const c of report.portraitIntel?.candidates || []) {
    if (!c.dHash || !c.userAssignment || c.userAssignment === "pending") continue;
    entry.portraitMemory = entry.portraitMemory.filter((m) => m.dHash !== c.dHash);
    entry.portraitMemory.push({
      dHash: c.dHash,
      assignment: c.userAssignment,
      label: c.label,
      platform: c.platform,
      profileUrl: c.profileUrl,
      lastSeenAt: new Date().toISOString(),
    });
  }
  entry.portraitMemory = entry.portraitMemory.slice(-80);

  if (report.identityWorkbench?.confirmed && report.identityWorkbench.selectedTargetId) {
    const target = report.identityWorkbench.profiles.find(
      (p) => p.id === report.identityWorkbench!.selectedTargetId,
    );
    entry.confirmedTargetId = report.identityWorkbench.selectedTargetId;
    entry.confirmedTargetLabel = target?.displayName;
  }

  saveAll(all);
}

export function mergePortraitAssignments(
  memory: PortraitMemoryEntry[],
  assignments: Array<{ portraitId: string; assignment: "subject" | "homonym" | "reject"; dHash?: string; label?: string; platform?: string; profileUrl?: string }>,
): PortraitMemoryEntry[] {
  const out = [...memory];
  for (const a of assignments) {
    if (!a.dHash) continue;
    const idx = out.findIndex((m) => m.dHash === a.dHash);
    const row: PortraitMemoryEntry = {
      dHash: a.dHash,
      assignment: a.assignment,
      label: a.label || a.portraitId,
      platform: a.platform,
      profileUrl: a.profileUrl,
      lastSeenAt: new Date().toISOString(),
    };
    if (idx >= 0) out[idx] = row;
    else out.push(row);
  }
  return out.slice(-80);
}