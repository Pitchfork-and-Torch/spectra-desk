import type { SubjectInput } from "../types.js";
import { fullName, locationLine } from "./subject.js";

/** US state → public-records search portals (public-source LE OSINT dorks). */
const STATE_PORTALS: Record<string, string[]> = {
  FL: ["sunbiz.org", "flcourts.gov", "myfloridalicense.com"],
  TX: ["texas.gov", "sos.texas.gov"],
  CA: ["bizfileonline.sos.ca.gov", "courts.ca.gov"],
  NY: ["appext20.dos.ny.gov", "nycourts.gov"],
  GA: ["sos.ga.gov", "georgiacourts.gov"],
};

function stateCode(subject: SubjectInput): string | undefined {
  const s = subject.state?.trim().toUpperCase();
  if (s && s.length === 2) return s;
  if (subject.city?.toLowerCase().includes("tampa")) return "FL";
  return undefined;
}

/** Law-enforcement-oriented public-record dorks (no authenticated/broker access). */
export function buildLeDorks(subject: SubjectInput, mode: "full" | "fast" | "validation" = "full"): string[] {
  const queries = new Set<string>();
  const name = fullName(subject);
  const loc = locationLine(subject);
  if (!name) return [];

  queries.add(`"${name}" site:linkedin.com/in`);
  if (loc) queries.add(`"${name}" "${loc}" site:linkedin.com/in`);

  queries.add(`"${name}" site:opencorporates.com`);
  queries.add(`"${name}" site:bbb.org`);
  queries.add(`"${name}" site:courtlistener.com OR site:unicourt.com`);
  queries.add(`"${name}" "arrest" OR "indictment" OR "complaint" OR "warrant"`);

  if (subject.employer) {
    queries.add(`"${name}" "${subject.employer}" site:linkedin.com/in`);
    queries.add(`"${subject.employer}" officer OR owner OR principal`);
  }

  const st = stateCode(subject);
  if (st) {
    for (const portal of STATE_PORTALS[st] || []) {
      queries.add(`"${name}" site:${portal}`);
    }
    if (st === "FL") {
      queries.add(`"${name}" Tampa site:sunbiz.org`);
      queries.add(`"${name}" "registered agent" OR "officer" site:sunbiz.org`);
    }
  }

  if (subject.city) {
    queries.add(`"${name}" "${subject.city}" business owner OR proprietor`);
    queries.add(`"${name}" "${subject.city}" property OR deed OR assessor`);
  }

  if (mode === "validation") {
    const priority: string[] = [];
    if (loc) priority.push(`"${name}" "${loc}" site:linkedin.com/in`);
    priority.push(`"${name}" site:linkedin.com/in`);
    if (st === "FL") priority.push(`"${name}" site:sunbiz.org`);
    for (const q of queries) if (!priority.includes(q)) priority.push(q);
    return priority.slice(0, 4);
  }

  if (mode === "fast") return [...queries].slice(0, 8);
  return [...queries].slice(0, 14);
}