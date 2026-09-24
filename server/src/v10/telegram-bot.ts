/**
 * Spectra Channel bot. Operator starts this outside Grok Build.
 * Dossiers are private messages. The membership room does not receive PDFs.
 *
 *   npx tsx src/v10/telegram-bot.ts
 *
 * Env:
 *   SPECTRA_TELEGRAM_BOT_TOKEN
 *   SPECTRA_OPERATOR_TELEGRAM_ID
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { SpectraEngine } from "../engine.js";
import {
  CHANNEL_DISCLAIMER,
  dailyCap,
  demoPdf,
  gateSubscriber,
  grantSubscriber,
  writeAudit,
} from "./channel.js";

const token = process.env.SPECTRA_TELEGRAM_BOT_TOKEN || "";
const operatorId = Number(process.env.SPECTRA_OPERATOR_TELEGRAM_ID || 0);
const api = `https://api.telegram.org/bot${token}`;

interface Update {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number };
    text?: string;
  };
}

function parseCommand(text: string): { cmd: string; rest: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/([a-z0-9_]+)(?:@\w+)?\s*([\s\S]*)$/i);
  if (!match) return { cmd: "", rest: trimmed };
  return { cmd: match[1]!.toLowerCase(), rest: (match[2] || "").trim() };
}

async function apiCall(method: string, body: FormData | Record<string, unknown>): Promise<void> {
  const init: RequestInit = { method: "POST" };
  if (body instanceof FormData) init.body = body;
  else {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${api}/${method}`, init);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${method} ${res.status} ${detail.slice(0, 200)}`);
  }
}

async function say(chatId: number, text: string): Promise<void> {
  await apiCall("sendMessage", { chat_id: chatId, text });
}

async function sendPdf(chatId: number, pdfPath: string, caption: string): Promise<void> {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", caption.slice(0, 900));
  const bytes = readFileSync(pdfPath);
  form.set("document", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), path.basename(pdfPath));
  await apiCall("sendDocument", form);
}

async function runLookup(fromId: number, chatId: number, rest: string): Promise<void> {
  const gate = gateSubscriber(fromId, rest);
  if (!gate.ok) {
    await say(chatId, gate.reason || "Refused.");
    return;
  }
  const parts = Object.fromEntries(
    rest.split(/\s+/).filter((part) => part.includes("=")).map((part) => {
      const idx = part.indexOf("=");
      return [part.slice(0, idx), part.slice(idx + 1)];
    }),
  ) as Record<string, string>;
  if (!parts.first && !parts.last && !parts.username && !parts.email) {
    const words = rest.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && !rest.includes("=")) {
      parts.first = words[0]!;
      parts.last = words.slice(1).join(" ");
    }
  }
  if (!parts.first && !parts.last && !parts.username && !parts.email) {
    await say(chatId, "Usage: /dossier Jane Doe   or   /dossier first=Jane last=Doe username=janedoe");
    return;
  }
  await say(chatId, `Running a public-source Fast brief. ${CHANNEL_DISCLAIMER}`);
  const engine = new SpectraEngine();
  const report = await engine.runInvestigation({ ...parts, mode: "fast" });
  const pdf = report.pdfFilename
    ? path.join(process.env.USERPROFILE || process.env.HOME || ".", ".spectra-desk", "cases", report.id, report.pdfFilename)
    : "";
  writeAudit({
    kind: "dossier",
    telegramId: fromId,
    day: new Date().toISOString().slice(0, 10),
    reportId: report.id,
    locked: false,
  });
  if (!pdf) {
    await say(chatId, `Brief ${report.id} finished without a PDF. It is not LOCKED.`);
    return;
  }
  await sendPdf(chatId, pdf, `${CHANNEL_DISCLAIMER} Case ${report.id}.`);
}

async function onMessage(update: Update): Promise<void> {
  const msg = update.message;
  const text = msg?.text || "";
  if (!msg || !text.startsWith("/")) return;
  const fromId = msg.from?.id;
  if (!fromId) return;
  const { cmd, rest } = parseCommand(text);
  if (cmd === "dossier" && msg.chat.type !== "private") {
    await say(msg.chat.id, "Lookups stay in a private chat with this bot. Do not drop a dossier into the room.");
    return;
  }
  if (cmd === "start" || cmd === "help") {
    await say(msg.chat.id, [
      "Spectra Channel",
      CHANNEL_DISCLAIMER,
      "The Windows exe is a free download. This bot is the paid room.",
      `Cap: ${dailyCap()} briefs a day.`,
      "/demo  fictional sample PDF",
      "/dossier Jane Doe",
      "/whoami",
    ].join("\n"));
    return;
  }
  if (cmd === "whoami") {
    await say(msg.chat.id, `Telegram id ${fromId}. Ask the operator to grant a paid month if /dossier refuses.`);
    return;
  }
  if (cmd === "demo") {
    const demo = demoPdf();
    await sendPdf(msg.chat.id, demo.pdfPath, `DEMO. Avery Quill is fictional. ${CHANNEL_DISCLAIMER}`);
    return;
  }
  if (cmd === "grant") {
    if (fromId !== operatorId) {
      await say(msg.chat.id, "Only the operator can grant a paid month.");
      return;
    }
    const [idText, daysText] = rest.split(/\s+/);
    const id = Number(idText);
    const days = Number(daysText || 30);
    if (!id || !days) {
      await say(msg.chat.id, "Usage: /grant <telegramId> <days>");
      return;
    }
    const row = grantSubscriber(id, days, "operator grant");
    await say(msg.chat.id, `Granted ${id} through ${row.paidThrough}.`);
    return;
  }
  if (cmd === "dossier") {
    await runLookup(fromId, msg.chat.id, rest);
  }
}

async function main(): Promise<void> {
  if (!token) {
    console.error("Set SPECTRA_TELEGRAM_BOT_TOKEN. This process is not started for you.");
    process.exit(1);
  }
  let offset = 0;
  console.error("Spectra Channel bot polling. Dossiers go to private chats. Not LOCKED.");
  for (;;) {
    const res = await fetch(`${api}/getUpdates?timeout=30&offset=${offset}`);
    const data = (await res.json()) as { ok: boolean; result?: Update[] };
    for (const update of data.result || []) {
      offset = update.update_id + 1;
      try {
        await onMessage(update);
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
      }
    }
  }
}

if ((process.argv[1] || "").includes("telegram-bot")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
