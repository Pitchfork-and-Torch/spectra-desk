/**
 * Spectra Desk v10 Channel.
 * A paid Telegram membership can request a public-source PDF.
 * The bot never LOCKS. The Windows app stays free.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deskHome, seedDemo } from "../v9/cases.js";

export interface Subscriber {
  telegramId: number;
  paidThrough: string;
  note?: string;
}

export interface ChannelFile {
  subscribers: Subscriber[];
}

export interface GateResult {
  ok: boolean;
  reason?: string;
}

const MINOR_PHRASE = /\b(underage|toddler|infant|preteen|schoolchild|my kid|my child|a child|years?\s*old)\b/i;

export function channelDir(): string {
  return process.env.SPECTRA_CHANNEL_DIR || path.join(deskHome(), "channel");
}

export function subscriberPath(): string {
  return path.join(channelDir(), "subscribers.json");
}

export function auditPath(): string {
  return path.join(channelDir(), "audit.jsonl");
}

export function dailyCap(): number {
  const n = Number(process.env.SPECTRA_CHANNEL_DAILY_CAP || 3);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export function loadSubscribers(): ChannelFile {
  const file = subscriberPath();
  if (!existsSync(file)) return { subscribers: [] };
  return JSON.parse(readFileSync(file, "utf8")) as ChannelFile;
}

export function saveSubscribers(data: ChannelFile): void {
  mkdirSync(channelDir(), { recursive: true });
  writeFileSync(subscriberPath(), JSON.stringify(data, null, 2), "utf8");
}

export function grantSubscriber(telegramId: number, days: number, note?: string, now = new Date()): Subscriber {
  const through = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const data = loadSubscribers();
  const row: Subscriber = {
    telegramId,
    paidThrough: through.toISOString().slice(0, 10),
    note,
  };
  data.subscribers = [row, ...data.subscribers.filter((s) => s.telegramId !== telegramId)];
  saveSubscribers(data);
  return row;
}

export function isMinorLookup(text: string): boolean {
  const age = text.match(/\b(\d{1,2})\s*(?:years?\s*old|yo)\b/i);
  if (age && Number(age[1]) < 18) return true;
  return MINOR_PHRASE.test(text) && !age;
}

export function gateSubscriber(telegramId: number, query: string, now = new Date()): GateResult {
  if (isMinorLookup(query)) {
    return { ok: false, reason: "This desk does not run lookups of minors." };
  }
  const row = loadSubscribers().subscribers.find((s) => s.telegramId === telegramId);
  if (!row) return { ok: false, reason: "No paid access on this Telegram id." };
  if (row.paidThrough < now.toISOString().slice(0, 10)) {
    return { ok: false, reason: "Paid access has lapsed." };
  }
  const day = now.toISOString().slice(0, 10);
  const used = countDossiers(telegramId, day);
  if (used >= dailyCap()) {
    return { ok: false, reason: `Daily cap is ${dailyCap()} public-source briefs.` };
  }
  return { ok: true };
}

function countDossiers(telegramId: number, day: string): number {
  if (!existsSync(auditPath())) return 0;
  return readFileSync(auditPath(), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as { telegramId?: number; day?: string; kind?: string };
      } catch {
        return {};
      }
    })
    .filter((row) => row.telegramId === telegramId && row.day === day && row.kind === "dossier")
    .length;
}

export function writeAudit(row: Record<string, unknown>): void {
  mkdirSync(channelDir(), { recursive: true });
  appendFileSync(auditPath(), JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n", "utf8");
}

export function demoPdf(): { id: string; pdfPath: string; locked: false } {
  const seeded = seedDemo();
  return { id: seeded.id, pdfPath: seeded.pdfPath, locked: false };
}

export const CHANNEL_DISCLAIMER =
  "Public sources only. Investigative lead, not legal proof of identity. This brief is not LOCKED. You confirm LOCKED. The machine does not.";
