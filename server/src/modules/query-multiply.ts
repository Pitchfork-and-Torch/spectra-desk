import type { SubjectInput } from "../types.js";
import { deriveUsernames, fullName, locationLine } from "./subject.js";
import { nameVariants } from "./name-variants.js";
import { extractAnchors } from "./anchors.js";
import { buildLeDorks } from "./le-dorks.js";
import { buildPhoneSearchDorks } from "./phone-intel.js";
import { buildPublicRecordDorks } from "./public-records-dorks.js";
import { generateMonikers, buildMonikerDiscoveryDorks } from "./moniker-engine.js";

export type QueryMode = "full" | "fast" | "validation" | "custom";

/** Hard caps. Fast is the desktop default. Custom is a family subset of the full cap. */
export const QUERY_CAPS: Record<QueryMode, number> = {
  fast: 12,
  full: 28,
  validation: 8,
  custom: 28,
};

/** Generate public search queries - multiply signals, divide homonyms. */
export function queryFamily(query: string): string {
  const s = query.toLowerCase();
  if (s.includes("@") || s.includes("gravatar")) return "email";
  if (/site:(github|reddit|twitter|x|instagram|youtube|soundcloud|bandcamp)\./.test(s)) return "username";
  if (s.includes("linkedin") || s.includes("professional")) return "employment";
  if (s.includes("archive.org") || s.includes("wayback")) return "archives";
  if (s.includes("site:")) return "records";
  return "name";
}

export function buildSearchQueries(
  subject: SubjectInput,
  mode: QueryMode = "full",
  families?: string[],
): string[] {
  const queries = new Set<string>();
  const name = fullName(subject);
  const loc = locationLine(subject);
  const anchors = extractAnchors(subject);
  const usernames = deriveUsernames(subject);
  const firstNames = subject.firstName ? nameVariants(subject.firstName) : [];

  const nameForms = new Set<string>();
  if (name) nameForms.add(`"${name}"`);
  for (const fn of firstNames) {
    if (subject.lastName) nameForms.add(`"${fn} ${subject.lastName}"`);
  }

  for (const nq of nameForms) {
    queries.add(nq);
    if (loc) queries.add(`${nq} ${loc}`);
    if (subject.employer) queries.add(`${nq} "${subject.employer}"`);
    for (const u of usernames.slice(0, 3)) queries.add(`${nq} "${u}"`);
    for (const d of anchors.domains) queries.add(`${nq} site:${d}`);
    // LinkedIn + location dorks (professional identity - highest signal for real-world subjects)
    queries.add(`${nq} site:linkedin.com/in`);
    if (loc) queries.add(`${nq} "${loc}" site:linkedin.com/in`);
    if (subject.city) queries.add(`${nq} "${subject.city}" linkedin profile`);
    if (loc) queries.add(`${nq} ${loc} professional`);
  }

  for (const u of usernames) {
    queries.add(`"${u}"`);
    queries.add(`"${u}" site:github.com`);
    queries.add(`"${u}" site:reddit.com`);
    queries.add(`"${u}" site:linkedin.com`);
    queries.add(`"${u}" site:twitter.com OR site:x.com`);
    queries.add(`"${u}" site:instagram.com`);
    queries.add(`"${u}" site:youtube.com`);
    queries.add(`"${u}" site:soundcloud.com OR site:bandcamp.com`);
    queries.add(`"${u}" "real name" OR "who is"`);
    if (name) queries.add(`"${u}" "${name}"`);
  }

  for (const d of anchors.domains) {
    queries.add(`site:${d}`);
    if (name) queries.add(`site:${d} "${name}"`);
    for (const u of usernames.slice(0, 2)) queries.add(`site:${d} "${u}"`);
  }

  if (subject.email) {
    queries.add(`"${subject.email}"`);
    const local = subject.email.split("@")[0];
    if (local) queries.add(`"${local}" site:github.com OR site:gravatar.com`);
  }

  if (subject.phone) {
    for (const d of buildPhoneSearchDorks(subject.phone, subject)) queries.add(d);
  }
  if (subject.address && subject.city) queries.add(`"${subject.address}" ${subject.city}`);

  const dorkMode = mode === "custom" ? "full" : mode;
  for (const d of buildLeDorks(subject, dorkMode)) queries.add(d);
  for (const d of buildPublicRecordDorks(subject, dorkMode)) queries.add(d);

  // v6 moniker discovery dorks (top handles only)
  const monikers = generateMonikers(subject, { max: 12 });
  for (const d of buildMonikerDiscoveryDorks(subject, monikers).slice(0, mode === "validation" ? 2 : 4)) {
    queries.add(d);
  }

  for (const kw of anchors.keywords.slice(0, 3)) {
    if (name) queries.add(`"${name}" ${kw}`);
  }

  if (mode === "validation" || mode === "fast") {
    const priority: string[] = [];
    if (name) priority.push(`"${name}"`);
    if (name) priority.push(`"${name}" site:linkedin.com/in`);
    if (name && loc) priority.push(`"${name}" "${loc}" site:linkedin.com/in`);
    for (const d of buildLeDorks(subject, mode).slice(0, mode === "validation" ? 3 : 4)) {
      if (!priority.includes(d)) priority.push(d);
    }
    if (name && loc) priority.push(`"${name}" ${loc}`);
    if (name && subject.employer) priority.push(`"${name}" "${subject.employer}"`);
    for (const d of anchors.domains) {
      priority.push(`site:${d}`);
      if (name) priority.push(`site:${d} "${name}"`);
    }
    const primaryUser = subject.username || usernames[0];
    if (primaryUser) {
      priority.push(`"${primaryUser}" site:github.com`);
      if (name) priority.push(`"${primaryUser}" "${name}"`);
    }
    if (subject.email) priority.push(`"${subject.email}"`);
    if (name && loc) priority.push(`"${name}" ${loc}`);
    for (const q of [...queries]) {
      if (!priority.includes(q)) priority.push(q);
    }
    return priority.slice(0, QUERY_CAPS[mode]);
  }
  let list = [...queries].slice(0, QUERY_CAPS.full);
  if (mode === "custom" && families && families.length > 0) {
    const allow = new Set(families);
    const filtered = list.filter((q) => allow.has(queryFamily(q)));
    list = filtered.length > 0 ? filtered : list.slice(0, QUERY_CAPS.fast);
  }
  return list.slice(0, QUERY_CAPS[mode]);
}