import type { BreachIntel } from "../types.js";

const UA = "SpectraDesk-OSINT/2.1";

export async function checkBreaches(email: string): Promise<BreachIntel> {
  const result: BreachIntel = { email, breaches: [], checked: false, source: "hibp" };

  const apiKey = process.env.HIBP_API_KEY;
  if (!apiKey) {
    result.note = "Set HIBP_API_KEY env var to enable Have I Been Pwned breach correlation.";
    return result;
  }

  try {
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: { "hibp-api-key": apiKey, "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      },
    );

    result.checked = true;

    if (res.status === 404) {
      result.breaches = [];
      return result;
    }

    if (!res.ok) {
      result.note = `HIBP returned ${res.status}`;
      return result;
    }

    const data = (await res.json()) as Array<{
      Name: string;
      BreachDate: string;
      DataClasses: string[];
      IsVerified: boolean;
    }>;

    result.breaches = data.map((b) => ({
      name: b.Name,
      date: b.BreachDate,
      dataClasses: b.DataClasses || [],
      verified: b.IsVerified,
    }));
  } catch (err) {
    result.note = `Breach check failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return result;
}