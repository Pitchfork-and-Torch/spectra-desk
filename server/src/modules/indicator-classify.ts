/**
 * Free-text indicator classifier for Toolkit routing (v7).
 * Detects email, phone, domain, IP, username, IBAN, crypto, VIN, URL, etc.
 */

export type IndicatorKind =
  | "email"
  | "phone"
  | "domain"
  | "ip"
  | "username"
  | "iban"
  | "btc"
  | "eth"
  | "vin"
  | "url"
  | "name"
  | "ssn_like"
  | "unknown";

export interface ClassifiedIndicator {
  raw: string;
  kind: IndicatorKind;
  normalized: string;
  confidence: number;
  /** Suggested toolkit categories for this indicator */
  suggestedCategories: string[];
  /** Params map for resolveToolkitUrl */
  params: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i;
const BTC_RE = /^(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/;
const ETH_RE = /^0x[a-fA-F0-9]{40}$/;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;
const URL_RE = /^https?:\/\/\S+/i;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;
const USERNAME_RE = /^@?[a-zA-Z0-9._-]{2,39}$/;
const NAME_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,60}$/;
const SSN_RE = /^\d{3}-?\d{2}-?\d{4}$/;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export function classifyIndicator(raw: string): ClassifiedIndicator {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    return {
      raw,
      kind: "unknown",
      normalized: "",
      confidence: 0,
      suggestedCategories: [],
      params: {},
    };
  }

  if (URL_RE.test(trimmed)) {
    let domain = "";
    try {
      domain = new URL(trimmed).hostname.replace(/^www\./, "");
    } catch {
      /* ignore */
    }
    return {
      raw: trimmed,
      kind: "url",
      normalized: trimmed,
      confidence: 0.95,
      suggestedCategories: ["domains", "searchengines", "images"],
      params: { url: trimmed, domain, term: trimmed, query: trimmed },
    };
  }

  if (EMAIL_RE.test(trimmed)) {
    const localpart = trimmed.split("@")[0] || "";
    const domain = trimmed.split("@")[1] || "";
    return {
      raw: trimmed,
      kind: "email",
      normalized: lower,
      confidence: 0.98,
      suggestedCategories: ["email", "usernames", "names"],
      params: {
        email: lower,
        localpart,
        domain,
        term: lower,
        username: localpart,
        query: lower,
      },
    };
  }

  const ibanClean = trimmed.replace(/\s+/g, "").toUpperCase();
  if (IBAN_RE.test(ibanClean) && ibanClean.length >= 15 && ibanClean.length <= 34) {
    return {
      raw: trimmed,
      kind: "iban",
      normalized: ibanClean,
      confidence: 0.92,
      suggestedCategories: ["iban", "searchengines"],
      params: { iban: ibanClean, term: ibanClean, query: ibanClean },
    };
  }

  if (ETH_RE.test(trimmed)) {
    return {
      raw: trimmed,
      kind: "eth",
      normalized: lower,
      confidence: 0.95,
      suggestedCategories: ["currencies"],
      params: { term: lower, query: lower, btc_address: lower },
    };
  }

  if (BTC_RE.test(trimmed)) {
    return {
      raw: trimmed,
      kind: "btc",
      normalized: trimmed,
      confidence: 0.9,
      suggestedCategories: ["currencies"],
      params: { btc_address: trimmed, term: trimmed, query: trimmed },
    };
  }

  if (IPV4_RE.test(trimmed)) {
    return {
      raw: trimmed,
      kind: "ip",
      normalized: trimmed,
      confidence: 0.97,
      suggestedCategories: ["ip", "domains"],
      params: { ip: trimmed, term: trimmed, query: trimmed, start_ip: trimmed },
    };
  }

  if (DOMAIN_RE.test(trimmed) && trimmed.includes(".")) {
    const domain = lower.replace(/^www\./, "");
    return {
      raw: trimmed,
      kind: "domain",
      normalized: domain,
      confidence: 0.93,
      suggestedCategories: ["domains", "ip", "email"],
      params: {
        domain,
        domain_nodots: domain.replace(/\./g, ""),
        term: domain,
        query: domain,
      },
    };
  }

  if (VIN_RE.test(trimmed.replace(/\s/g, ""))) {
    const vin = trimmed.replace(/\s/g, "").toUpperCase();
    return {
      raw: trimmed,
      kind: "vin",
      normalized: vin,
      confidence: 0.88,
      suggestedCategories: ["vehicles"],
      params: { vin, term: vin, query: vin },
    };
  }

  if (SSN_RE.test(trimmed)) {
    return {
      raw: trimmed,
      kind: "ssn_like",
      normalized: digitsOnly(trimmed),
      confidence: 0.7,
      suggestedCategories: ["names", "searchengines"],
      params: { ssn: digitsOnly(trimmed), term: trimmed, query: trimmed },
    };
  }

  const digs = digitsOnly(trimmed);
  if (PHONE_RE.test(trimmed) && digs.length >= 7 && digs.length <= 15) {
    const e164 = trimmed.startsWith("+") ? `+${digs}` : digs;
    return {
      raw: trimmed,
      kind: "phone",
      normalized: e164,
      confidence: digs.length >= 10 ? 0.9 : 0.75,
      suggestedCategories: ["phoneus", "phoneint", "names"],
      params: {
        phone: e164,
        e164,
        number: digs,
        term: e164,
        query: e164,
        dt_num_only: digs,
        nat_num: digs,
      },
    };
  }

  if (trimmed.includes(" ") && NAME_RE.test(trimmed) && trimmed.split(/\s+/).length >= 2) {
    const parts = trimmed.split(/\s+/);
    const first = parts[0] || "";
    const last = parts[parts.length - 1] || "";
    return {
      raw: trimmed,
      kind: "name",
      normalized: trimmed,
      confidence: 0.75,
      suggestedCategories: ["names", "searchengines", "linkedin", "publiccompanyrecords"],
      params: {
        first,
        last,
        firstname: first,
        lastname: last,
        full: trimmed,
        fullname: trimmed,
        term: trimmed,
        query: `"${trimmed}"`,
        realname: trimmed,
      },
    };
  }

  if (USERNAME_RE.test(trimmed)) {
    const username = trimmed.replace(/^@/, "");
    return {
      raw: trimmed,
      kind: "username",
      normalized: username,
      confidence: 0.8,
      suggestedCategories: ["usernames", "x", "instagram", "facebook", "keybase", "communities"],
      params: {
        username,
        term: username,
        query: username,
        usera: username,
      },
    };
  }

  return {
    raw: trimmed,
    kind: "unknown",
    normalized: trimmed,
    confidence: 0.3,
    suggestedCategories: ["searchengines", "names"],
    params: { term: trimmed, query: trimmed, keyword: trimmed },
  };
}

/** Classify multiple indicators from free text (split by lines / commas). */
export function classifyIndicators(text: string): ClassifiedIndicator[] {
  const parts = text
    .split(/[\n,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map(classifyIndicator);
}
