import type { SubjectDossier } from "../types.js";

const XAI_URL = "https://api.x.ai/v1/chat/completions";

/** Optional Grok/xAI enhancement - deterministic fallback when no API key. */
export async function enhanceDossierNarrative(dossier: SubjectDossier): Promise<SubjectDossier> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) return dossier;

  const factBlock = [
    `Confidence: ${dossier.confidenceTier}`,
    `Employment: ${dossier.employment.map((e) => e.organization).join("; ") || "unknown"}`,
    `Locations: ${dossier.locations.map((l) => l.label).join("; ") || "unknown"}`,
    `Social: ${dossier.socialProfiles.map((s) => `${s.platform}@${s.username}`).join(", ") || "none"}`,
    `Contacts: ${dossier.contacts.map((c) => `${c.type}:${c.value}`).join(", ") || "none"}`,
    `Family signals: ${dossier.relatives.map((r) => `${r.relation} ${r.name}`).join(", ") || "none"}`,
    `Gaps: ${dossier.gaps.join("; ")}`,
    `Base narrative: ${dossier.narrativeSummary}`,
  ].join("\n");

  try {
    const res = await fetch(XAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROK_MODEL || "grok-3-mini",
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You are an OSINT analyst writing an investigator dossier summary. Use ONLY facts provided. Do not invent contacts, family, or employers. Mark uncertainty. Public sources only. 2-4 sentences.",
          },
          { role: "user", content: factBlock },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) return dossier;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const enhanced = data.choices?.[0]?.message?.content?.trim();
    if (!enhanced || enhanced.length < 40) return dossier;

    return {
      ...dossier,
      narrativeSummary: `${enhanced}\n\n - Base assessment: ${dossier.narrativeSummary.slice(0, 400)}`,
    };
  } catch {
    return dossier;
  }
}