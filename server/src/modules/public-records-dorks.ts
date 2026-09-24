/**
 * Public-record & people-search style dorks (v6) - indexable sources only.
 * No broker APIs, no authenticated portals.
 */
import type { SubjectInput } from "../types.js";
import { fullName, locationLine } from "./subject.js";
import { buildLeDorks } from "./le-dorks.js";

export function buildPublicRecordDorks(
  subject: SubjectInput,
  mode: "full" | "fast" | "validation" = "full",
): string[] {
  const name = fullName(subject);
  const loc = locationLine(subject);
  const q = new Set<string>();
  if (!name) return [];

  // Base LE dorks (sunbiz, courts, linkedin, etc.)
  for (const d of buildLeDorks(subject, mode)) q.add(d);

  // News / press
  q.add(`"${name}" (arrest OR charged OR sentenced OR "date of birth" OR DOB)`);
  q.add(`"${name}" (obituary OR wedding OR "engaged to" OR "survived by")`);
  if (loc) q.add(`"${name}" "${loc}" (news OR times OR tribune OR herald)`);

  // Business / professional
  q.add(`"${name}" ("registered agent" OR officer OR director OR LLC OR Inc)`);
  q.add(`"${name}" (site:opencorporates.com OR site:sec.gov OR site:bloomberg.com)`);

  // Property / assessor (public portals often indexable)
  if (subject.city) {
    q.add(`"${name}" "${subject.city}" (property OR parcel OR assessor OR appraisal)`);
    q.add(`"${name}" "${subject.city}" (deed OR "warranty deed" OR mortgage)`);
  }

  // Education / employment pivots
  if (subject.employer) {
    q.add(`"${name}" "${subject.employer}" (employee OR manager OR founder OR "works at")`);
  }
  q.add(`"${name}" (university OR college OR alumni OR graduation)`);

  // Contact surface (public pages only)
  q.add(`"${name}" ("@gmail.com" OR "@yahoo.com" OR "@hotmail.com" OR "@icloud.com")`);
  q.add(`"${name}" ("phone" OR "tel:" OR "contact") "${subject.city || subject.state || ""}"`.trim());

  // Sports / niche (Dustin-class MMA appeared in wild searches)
  q.add(`"${name}" (MMA OR sherdog OR "fight history" OR ESPN)`);

  if (mode === "validation") return [...q].slice(0, 6);
  if (mode === "fast") return [...q].slice(0, 12);
  return [...q].slice(0, 20);
}
