import type { EmailRegistrationHit } from "../types.js";

const UA = "SpectraDesk-OSINT/5.0";

/** Public registration probes inspired by holehe - no login bypass, rate-limited. */
export async function probeEmailRegistrations(email: string): Promise<EmailRegistrationHit[]> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return [];

  const checks: Array<{
    site: string;
    run: () => Promise<EmailRegistrationHit | null>;
  }> = [
    {
      site: "Spotify",
      run: async () => {
        try {
          const res = await fetch("https://spclient.wg.spotify.com/signup/public/v1/account", {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": UA },
            body: JSON.stringify({ email: normalized, password: "SpectraProbe1!", birthdate: "1990-01-01" }),
            signal: AbortSignal.timeout(8_000),
          });
          const data = (await res.json()) as { status?: number; errors?: { email?: string } };
          const taken = data.status === 20 || /already|exists|registered/i.test(data.errors?.email || "");
          return { site: "Spotify", registered: taken, confidence: taken ? 72 : 55, method: "signup-probe" };
        } catch {
          return null;
        }
      },
    },
    {
      site: "Twitter/X",
      run: async () => {
        try {
          const res = await fetch(
            `https://api.twitter.com/i/users/email_available.json?email=${encodeURIComponent(normalized)}`,
            { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) },
          );
          if (!res.ok) return null;
          const data = (await res.json()) as { taken?: boolean; valid?: boolean };
          if (data.valid === false) return { site: "Twitter/X", registered: false, confidence: 40, method: "availability-api" };
          return {
            site: "Twitter/X",
            registered: Boolean(data.taken),
            confidence: data.taken ? 70 : 50,
            method: "availability-api",
          };
        } catch {
          return null;
        }
      },
    },
    {
      site: "Adobe",
      run: async () => {
        try {
          const res = await fetch("https://auth.services.adobe.com/signin/v2/users/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": UA },
            body: JSON.stringify({ username: normalized, usernameType: "EMAIL" }),
            signal: AbortSignal.timeout(8_000),
          });
          if (!res.ok) return null;
          const data = (await res.json()) as Array<{ type?: string }>;
          const registered = Array.isArray(data) && data.length > 0;
          return { site: "Adobe", registered, confidence: registered ? 68 : 52, method: "account-lookup" };
        } catch {
          return null;
        }
      },
    },
    {
      site: "Gravatar",
      run: async () => {
        try {
          const { createHash } = await import("node:crypto");
          const hash = createHash("md5").update(normalized).digest("hex");
          const res = await fetch(`https://www.gravatar.com/avatar/${hash}?d=404`, {
            method: "HEAD",
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(6_000),
          });
          const registered = res.status === 200;
          return { site: "Gravatar", registered, confidence: registered ? 85 : 45, method: "avatar-probe" };
        } catch {
          return null;
        }
      },
    },
  ];

  const results: EmailRegistrationHit[] = [];
  for (const check of checks) {
    const hit = await check.run();
    if (hit) results.push(hit);
  }
  return results;
}