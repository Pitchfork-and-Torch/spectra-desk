/**
 * Local IBAN validation & parse (ISO 13616 mod-97) - offline, no network (v7).
 * Bank-name enrichment is best-effort from optional lightweight registry.
 */

export interface IbanParseResult {
  raw: string;
  normalized: string;
  isValid: boolean;
  countryCode?: string;
  checkDigits?: string;
  bban?: string;
  lengthOk?: boolean;
  expectedLength?: number;
  countryName?: string;
  bankCode?: string;
  message: string;
  searchLinks: Array<{ engine: string; url: string }>;
}

/** Common IBAN lengths by country (subset; validation still uses mod-97). */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29,
  BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29,
  ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20,
  LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19,
  MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29,
  RO: 24, RS: 22, SA: 24, SE: 24, SI: 19, SK: 24, SM: 27, TN: 24, TR: 26, UA: 29,
  VA: 22, VG: 24, XK: 20,
};

const COUNTRY_NAMES: Record<string, string> = {
  AD: "Andorra", AE: "United Arab Emirates", AL: "Albania", AT: "Austria",
  BE: "Belgium", BG: "Bulgaria", CH: "Switzerland", CY: "Cyprus", CZ: "Czechia",
  DE: "Germany", DK: "Denmark", EE: "Estonia", ES: "Spain", FI: "Finland",
  FR: "France", GB: "United Kingdom", GR: "Greece", HR: "Croatia", HU: "Hungary",
  IE: "Ireland", IL: "Israel", IT: "Italy", LT: "Lithuania", LU: "Luxembourg",
  LV: "Latvia", MT: "Malta", NL: "Netherlands", NO: "Norway", PL: "Poland",
  PT: "Portugal", RO: "Romania", SE: "Sweden", SI: "Slovenia", SK: "Slovakia",
  TR: "Turkey", UA: "Ukraine", US: "United States",
};

function mod97(iban: string): number {
  // Move first 4 chars to end, A=10 ... Z=35
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let expanded = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) expanded += String(code - 55);
    else expanded += ch;
  }
  // iterative mod 97 for big integer
  let remainder = 0;
  for (const ch of expanded) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder;
}

function extractBankCode(country: string, bban: string): string | undefined {
  switch (country) {
    case "DE":
    case "AT":
      return bban.slice(0, 8);
    case "NL":
      return bban.slice(0, 4);
    case "GB":
    case "IE":
      return bban.slice(0, 4);
    case "FR":
    case "MC":
      return bban.slice(0, 5);
    case "IT":
    case "SM":
      return bban.slice(1, 6); // skip CIN
    case "ES":
      return bban.slice(0, 4);
    case "BE":
      return bban.slice(0, 3);
    case "CH":
    case "LI":
      return bban.slice(0, 5);
    case "PL":
      return bban.slice(0, 8);
    default:
      return bban.slice(0, Math.min(8, bban.length));
  }
}

export function analyzeIban(raw: string): IbanParseResult {
  const normalized = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized)) {
    return {
      raw,
      normalized,
      isValid: false,
      message: "IBAN must start with country code + check digits and use alphanumeric characters only.",
      searchLinks: [],
    };
  }

  const countryCode = normalized.slice(0, 2);
  const checkDigits = normalized.slice(2, 4);
  const bban = normalized.slice(4);
  const expectedLength = IBAN_LENGTHS[countryCode];
  const lengthOk = expectedLength ? normalized.length === expectedLength : normalized.length >= 15 && normalized.length <= 34;
  const checksumOk = mod97(normalized) === 1;
  const isValid = lengthOk && checksumOk;
  const bankCode = extractBankCode(countryCode, bban);

  const q = encodeURIComponent(normalized);
  const searchLinks = [
    { engine: "Google", url: `https://www.google.com/search?q=${q}` },
    { engine: "Bing", url: `https://www.bing.com/search?q=${q}` },
    { engine: "Yandex", url: `https://yandex.com/search/?text=${q}` },
    { engine: "IBAN Calculator", url: `https://www.ibancalculator.com/iban_validieren.html` },
  ];

  let message: string;
  if (isValid) {
    message = `Valid IBAN for ${COUNTRY_NAMES[countryCode] || countryCode}${bankCode ? ` (bank code ${bankCode})` : ""}.`;
  } else if (!lengthOk && expectedLength) {
    message = `Length mismatch: expected ${expectedLength} for ${countryCode}, got ${normalized.length}.`;
  } else if (!checksumOk) {
    message = "Checksum failed (mod-97). Digits may be mistyped.";
  } else {
    message = "Could not validate IBAN.";
  }

  return {
    raw,
    normalized,
    isValid,
    countryCode,
    checkDigits,
    bban,
    lengthOk,
    expectedLength,
    countryName: COUNTRY_NAMES[countryCode],
    bankCode,
    message,
    searchLinks,
  };
}
