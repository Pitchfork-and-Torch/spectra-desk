import type { SubjectInput } from "../types.js";
import { deriveUsernames } from "./subject.js";
import { nameMatchesInText, nameVariants } from "./name-variants.js";
import type { ExtractedLink } from "./website-profiler.js";

export type LinkOwnership = "self-claimed" | "site-linked" | "collaborator" | "unknown";

export interface OwnershipAssessment {
  ownership: LinkOwnership;
  handleMatchesSubject: boolean;
  nameMatchScore: number;
  rationale: string;
}

const COLLABORATOR_CONTEXT =
  /recommendation|collaborat|credit|featured[-_]?by|guest|shout[-_]?out|friend|colleague|predator\s*poach/i;

function normalizeHandle(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Does a platform handle plausibly belong to the subject (not merely linked on their site)? */
export function handleMatchesSubject(handle: string, subject: SubjectInput): boolean {
  const h = normalizeHandle(handle);
  if (!h) return false;

  const candidates = new Set<string>();
  if (subject.username) candidates.add(normalizeHandle(subject.username));
  for (const u of deriveUsernames(subject)) candidates.add(normalizeHandle(u));

  if (subject.firstName && subject.lastName) {
    const f = compact(subject.firstName);
    const l = compact(subject.lastName);
    candidates.add(`${f}${l}`);
    candidates.add(`${f}_${l}`);
    candidates.add(`${f}.${l}`);
    candidates.add(`${f[0]}${l}`);
    candidates.add(`${l}${f}`);
    for (const v of nameVariants(subject.firstName)) {
      candidates.add(`${compact(v)}${l}`);
    }
    // Music-style handles: JohnDoeMusic, johndoemusic
    candidates.add(`${f}${l}music`);
    candidates.add(`${f}${l}official`);
  }

  for (const c of candidates) {
    if (!c || c.length < 3) continue;
    if (h === c || h.includes(c) || c.includes(h)) return true;
  }
  return false;
}

export function assessLinkOwnership(
  link: ExtractedLink,
  subject: SubjectInput,
  sameAsUrls?: Set<string>,
): OwnershipAssessment {
  const handle = link.handle || "";
  const handleOk = handle ? handleMatchesSubject(handle, subject) : false;
  const inSameAs = sameAsUrls?.has(link.url) ?? link.inSchemaSameAs === true;
  const isRelMe = link.source === "rel-me";
  const isCollaborator =
    link.linkRole === "collaborator" ||
    link.contextHint === "recommendation" ||
    (!inSameAs && !isRelMe && link.source === "body" && !handleOk);

  if (isRelMe || inSameAs) {
    return {
      ownership: "self-claimed",
      handleMatchesSubject: handleOk,
      nameMatchScore: handleOk ? 1 : 0,
      rationale: isRelMe
        ? "rel=me on owned site (strong self-claim)"
        : "Listed in schema.org sameAs on owned site",
    };
  }

  if (isCollaborator || (link.source === "body" && !handleOk && !inSameAs)) {
    const ctx = link.contextHint === "recommendation" ? "recommendation/credit block" : "body link without name/handle match";
    return {
      ownership: "collaborator",
      handleMatchesSubject: false,
      nameMatchScore: 0,
      rationale: `Linked on subject site (${ctx}) - treat as associate/colleague unless corroborated elsewhere`,
    };
  }

  if (link.source === "footer" || link.source === "json-ld" || link.source === "meta") {
    return {
      ownership: handleOk ? "site-linked" : "collaborator",
      handleMatchesSubject: handleOk,
      nameMatchScore: handleOk ? 0.85 : 0,
      rationale: handleOk
        ? "Site navigation link with handle aligned to subject"
        : "Site link with handle not aligned to subject name/username",
    };
  }

  return {
    ownership: handleOk ? "site-linked" : "unknown",
    handleMatchesSubject: handleOk,
    nameMatchScore: handleOk ? 0.7 : 0,
    rationale: handleOk ? "Handle aligns with subject variants" : "Ownership unclear from link context alone",
  };
}

export function collaboratorContextFromHtml(parentClass: string, parentId: string, anchorText: string): boolean {
  const blob = `${parentClass} ${parentId} ${anchorText}`;
  return COLLABORATOR_CONTEXT.test(blob);
}