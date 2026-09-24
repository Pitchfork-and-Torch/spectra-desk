import type { DomainIntel } from "../types.js";
import { fetchWaybackSnapshot } from "./wayback.js";

export async function analyzeDomain(domain: string): Promise<DomainIntel | null> {
  const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!clean || !clean.includes(".")) return null;

  const intel: DomainIntel = { domain: clean, url: `https://${clean}` };

  try {
    const rdap = await fetch(`https://rdap.org/domain/${encodeURIComponent(clean)}`, {
      headers: { Accept: "application/rdap+json", "User-Agent": "SpectraDesk-OSINT/2.1" },
    });
    if (rdap.ok) {
      const data = (await rdap.json()) as Record<string, unknown>;
      const events = (data.events as Array<{ eventAction?: string; eventDate?: string }>) || [];
      const registration = events.find((e) => e.eventAction === "registration");
      const expiration = events.find((e) => e.eventAction === "expiration");
      const statuses = (data.status as string[]) || [];
      const entities = (data.entities as Array<{ roles?: string[]; vcardArray?: unknown[] }>) || [];
      const nameservers = ((data.nameservers as Array<{ ldhName?: string }>) || [])
        .map((n) => n.ldhName)
        .filter(Boolean) as string[];

      let registrar: string | undefined;
      let registrantCountry: string | undefined;
      for (const ent of entities) {
        const vcard = ent.vcardArray?.[1] as Array<unknown[]> | undefined;
        if (!vcard) continue;
        const fn = vcard.find((row) => row[0] === "fn");
        if (fn?.[3] && ent.roles?.includes("registrar")) registrar = String(fn[3]);
        const adr = vcard.find((row) => row[0] === "adr");
        if (adr?.[3] && ent.roles?.includes("registrant")) {
          const parts = adr[3] as string[];
          registrantCountry = parts[parts.length - 1];
        }
      }

      intel.rdap = {
        registrar,
        created: registration?.eventDate,
        expires: expiration?.eventDate,
        status: statuses.slice(0, 6),
        nameservers: nameservers.slice(0, 4),
        registrantCountry,
      };
    }
  } catch {
    /* rdap optional */
  }

  try {
    const res = await fetch(`https://${clean}`, {
      redirect: "follow",
      headers: { "User-Agent": "SpectraDesk-OSINT/2.1" },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      const html = await res.text();
      intel.siteTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
      intel.siteDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]?.trim();
      intel.siteTextSample = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200);
    }
  } catch {
    /* site fetch optional */
  }

  const wayback = await fetchWaybackSnapshot(intel.url);
  intel.wayback = {
    available: wayback.available,
    snapshotUrl: wayback.snapshotUrl,
    timestamp: wayback.timestamp,
  };

  return intel;
}