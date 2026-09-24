import { createHash } from "node:crypto";
import { resolveMx } from "node:dns/promises";
import type { EmailIntel, SearchHit } from "../types.js";
import { checkGravatar } from "./enrich.js";
import { checkBreaches } from "./breach-index.js";
import { probeEmailRegistrations } from "./email-registration.js";

export async function analyzeEmail(email: string, mentions: SearchHit[]): Promise<EmailIntel> {
  const validFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const domain = email.split("@")[1] || "";
  const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  const gravatarUrl = `https://www.gravatar.com/avatar/${hash}?d=404`;
  const gravatarExists = await checkGravatar(email);
  const breachIntel = await checkBreaches(email);
  const registrationProbes = await probeEmailRegistrations(email);

  let mxRecords: string[] | undefined;
  try {
    const mx = await resolveMx(domain);
    mxRecords = mx.map((r) => `${r.exchange} (priority ${r.priority})`);
  } catch {
    mxRecords = undefined;
  }

  return {
    email,
    validFormat,
    domain,
    gravatarUrl,
    gravatarExists,
    mxRecords,
    breachIntel,
    registrationProbes,
    publicMentions: mentions.filter(
      (m) => m.title.toLowerCase().includes(email) || m.snippet.toLowerCase().includes(email) || m.url.includes(email),
    ),
  };
}