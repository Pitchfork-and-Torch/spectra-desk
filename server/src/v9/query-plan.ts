import { buildSearchQueries, QUERY_CAPS, queryFamily, type QueryMode } from "../modules/query-multiply.js";
import { parseSubject } from "../modules/subject.js";
import type { SubjectInput } from "../types.js";

export const QUERY_FAMILIES = ["name", "email", "username", "employment", "records", "archives"] as const;

export interface QueryPlan {
  mode: QueryMode;
  cap: number;
  count: number;
  families: string[];
  queries: string[];
  willAsk: string[];
  willNot: string[];
}

export function describeQueryPlan(raw: Record<string, string | undefined>, families?: string[]): QueryPlan {
  const mode = (raw.mode as QueryMode) || "fast";
  const safeMode: QueryMode = mode === "full" || mode === "validation" || mode === "custom" ? mode : "fast";
  const subject: SubjectInput = parseSubject(raw);
  const selected = families && families.length > 0 ? families : safeMode === "custom" ? ["name", "email", "username"] : [...QUERY_FAMILIES];
  const queries = buildSearchQueries(subject, safeMode, selected);
  const used = [...new Set(queries.map(queryFamily))];
  const willNot = QUERY_FAMILIES.filter((family) => !used.includes(family));
  const notes = [
    safeMode === "fast" ? "Fast stops at 12. It does not run the wider recall pack." : "",
    safeMode === "full" ? "Full stops at 28. It does not open broker or private-account sources." : "",
    safeMode === "custom" ? "Custom runs only the families you left on, inside the full cap." : "",
    safeMode === "validation" ? "Validation is a short smoke pack." : "",
  ].filter(Boolean);
  return {
    mode: safeMode,
    cap: QUERY_CAPS[safeMode],
    count: queries.length,
    families: used,
    queries,
    willAsk: notes,
    willNot: willNot.map((family) => `${family} is not in this pack`),
  };
}
