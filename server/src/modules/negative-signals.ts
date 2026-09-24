import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const STORE = path.join(process.env.USERPROFILE || process.env.HOME || ".", ".spectra-desk", "negative-signals.json");

export interface NegativeSignal {
  subjectKey: string;
  url: string;
  label: string;
  reason: string;
  markedAt: string;
}

function storePath() {
  const dir = path.dirname(STORE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return STORE;
}

function subjectKey(first?: string, last?: string): string {
  return `${(first || "").toLowerCase()}|${(last || "").toLowerCase()}`;
}

export function loadNegativeSignals(first?: string, last?: string): NegativeSignal[] {
  try {
    const all = JSON.parse(readFileSync(storePath(), "utf8")) as NegativeSignal[];
    const key = subjectKey(first, last);
    return all.filter((s) => s.subjectKey === key);
  } catch {
    return [];
  }
}

export function saveNegativeSignal(first: string | undefined, last: string | undefined, url: string, label: string, reason: string) {
  let all: NegativeSignal[] = [];
  try {
    all = JSON.parse(readFileSync(storePath(), "utf8")) as NegativeSignal[];
  } catch {
    /* fresh */
  }
  const key = subjectKey(first, last);
  const entry: NegativeSignal = { subjectKey: key, url: url.split("#")[0], label, reason, markedAt: new Date().toISOString() };
  all = all.filter((s) => !(s.subjectKey === key && s.url === entry.url));
  all.push(entry);
  writeFileSync(storePath(), JSON.stringify(all.slice(-500), null, 2), "utf8");
}

export function urlIsNegativelyMarked(first: string | undefined, last: string | undefined, url: string): NegativeSignal | null {
  const key = url.split("#")[0];
  return loadNegativeSignals(first, last).find((s) => s.url === key) || null;
}