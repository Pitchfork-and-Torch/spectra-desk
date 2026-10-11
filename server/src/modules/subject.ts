import type { SubjectInput } from "../types.js";

export function parseSubject(raw: Record<string, string | undefined>): SubjectInput {
  return {
    firstName: raw.firstName?.trim(),
    lastName: raw.lastName?.trim(),
    middleName: raw.middleName?.trim(),
    email: raw.email?.trim().toLowerCase(),
    phone: raw.phone?.trim(),
    username: raw.username?.trim(),
    address: raw.address?.trim(),
    city: raw.city?.trim(),
    state: raw.state?.trim(),
    country: raw.country?.trim(),
    employer: raw.employer?.trim(),
    notes: raw.notes?.trim(),
  };
}

export function fullName(s: SubjectInput): string {
  return [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
}

export function locationLine(s: SubjectInput): string {
  return [s.city, s.state, s.country].filter(Boolean).join(", ");
}

export function deriveUsernames(s: SubjectInput): string[] {
  const candidates = new Set<string>();
  if (s.username) candidates.add(s.username);
  if (s.email) {
    const local = s.email.split("@")[0];
    if (local) candidates.add(local);
  }
  if (s.firstName && s.lastName) {
    const f = s.firstName.toLowerCase();
    const l = s.lastName.toLowerCase();
    candidates.add(`${f}${l}`);
    candidates.add(`${f}.${l}`);
    candidates.add(`${f}_${l}`);
    candidates.add(`${f}-${l}`);
    candidates.add(`${f[0]}${l}`);
  }
  return [...candidates].slice(0, 6);
}

export { buildSearchQueries, QUERY_CAPS, type QueryMode } from "./query-multiply.js";