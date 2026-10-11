const NICKNAMES: Record<string, string[]> = {
  robert: ["bob", "rob", "bobby"],
  william: ["bill", "will", "billy"],
  richard: ["rick", "dick", "rich"],
  james: ["jim", "jimmy", "jamie"],
  michael: ["mike", "mikey"],
  elizabeth: ["liz", "beth", "betty"],
  katherine: ["kate", "kathy", "kat"],
  jonathan: ["jon", "john"],
  joseph: ["joe", "joey"],
  thomas: ["tom", "tommy"],
  christopher: ["chris"],
  daniel: ["dan", "danny"],
  matthew: ["matt"],
  anthony: ["tony"],
  benjamin: ["ben"],
};

export function nameVariants(first?: string): string[] {
  if (!first) return [];
  const lower = first.toLowerCase();
  const variants = new Set<string>([lower, first]);
  for (const [canonical, nicks] of Object.entries(NICKNAMES)) {
    if (lower === canonical || nicks.includes(lower)) {
      variants.add(canonical);
      nicks.forEach((n) => variants.add(n));
    }
  }
  return [...variants];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Last name must appear as a distinct token - not as a substring inside a concatenated username. */
function lastNameTokenPresent(last: string, text: string): boolean {
  const re = new RegExp(`\\b${escapeRegExp(last)}\\b`, "i");
  return re.test(text);
}

export function nameMatchesInText(first: string | undefined, last: string | undefined, text: string): number {
  if (!first || !last) return 0;
  if (!lastNameTokenPresent(last, text)) return 0;

  const t = text.toLowerCase();
  const firstVariants = nameVariants(first);
  let best = 0;
  for (const v of firstVariants) {
    const token = new RegExp(`\\b${escapeRegExp(v)}\\b`, "i");
    if (token.test(t)) best = Math.max(best, v === first.toLowerCase() ? 1 : 0.85);
    else if (t.includes(v) && v.length >= 4) best = Math.max(best, 0.55);
  }
  return best;
}