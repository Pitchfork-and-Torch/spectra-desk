import { describe, expect, it } from "vitest";
import { buildLeDorks } from "../modules/le-dorks.js";
import { buildSearchQueries } from "../modules/query-multiply.js";

describe("le-dorks", () => {
  it("includes Florida sunbiz and LinkedIn dorks for Tampa subject", () => {
    const subject = { firstName: "Dustin", lastName: "Daprizio", city: "Tampa", state: "FL" };
    const dorks = buildLeDorks(subject, "validation");
    expect(dorks.some((q) => q.includes("sunbiz.org"))).toBe(true);
    expect(dorks.some((q) => q.includes("linkedin.com/in"))).toBe(true);
  });

  it("merges LE dorks into search query builder", () => {
    const subject = { firstName: "Jane", lastName: "Doe", city: "Tampa", state: "FL" };
    const queries = buildSearchQueries(subject, "validation");
    expect(queries.some((q) => q.includes("opencorporates") || q.includes("sunbiz"))).toBe(true);
  });
});