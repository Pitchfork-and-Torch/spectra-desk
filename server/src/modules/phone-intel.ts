import type { PhoneIntel, SubjectInput } from "../types.js";
import { fullName } from "./subject.js";

export function normalizeUsPhone(raw: string): { digits: string; e164?: string; national?: string; areaCode?: string } | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return { digits, e164: `+1${digits}`, national: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`, areaCode: digits.slice(0, 3) };
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return { digits: d, e164: `+1${d}`, national: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, areaCode: d.slice(0, 3) };
  }
  return null;
}

export function buildPhoneSearchDorks(phone: string, subject?: SubjectInput): string[] {
  const norm = normalizeUsPhone(phone);
  if (!norm) return [`"${phone}"`];
  const name = subject ? fullName(subject) : "";
  const queries = [
    `"${norm.national}"`,
    `"${norm.digits}"`,
    norm.e164 ? `"${norm.e164}"` : "",
    name ? `"${name}" "${norm.national}"` : "",
    name ? `"${name}" "${norm.areaCode}"` : "",
    `"${norm.national}" site:truepeoplesearch.com OR site:fastpeoplesearch.com`,
  ].filter(Boolean);
  return [...new Set(queries)].slice(0, 5);
}

export async function analyzePhone(phone: string, subject?: SubjectInput): Promise<PhoneIntel> {
  const norm = normalizeUsPhone(phone);
  const dorks = buildPhoneSearchDorks(phone, subject);
  return {
    raw: phone,
    normalized: norm?.national,
    e164: norm?.e164,
    areaCode: norm?.areaCode,
    validFormat: norm !== null,
    searchDorks: dorks,
    note: "Public-source phone pivots only - no carrier lookup or paid data brokers.",
  };
}