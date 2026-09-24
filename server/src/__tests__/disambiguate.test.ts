import { describe, expect, it } from "vitest";
import { disambiguate } from "../modules/disambiguate.js";
import type { SearchHit } from "../types.js";
import { ANCHOR_DOMAIN, JOHN_DOE } from "./test-subjects.js";

const baseHit = (overrides: Partial<SearchHit>): SearchHit => ({
  title: "John Doe",
  url: `https://${ANCHOR_DOMAIN}`,
  snippet: "folk musician",
  source: "test",
  query: "q",
  classification: "corroborated",
  relevanceScore: 80,
  anchorSignals: [`domain:${ANCHOR_DOMAIN}`],
  ...overrides,
});

describe("disambiguate", () => {
  it("scores anchored John Doe highly", () => {
    const d = disambiguate(
      { ...JOHN_DOE, email: "john.doe@example.com" },
      [baseHit({}), baseHit({ url: "https://github.com/johndoe-dev", title: "GitHub" })],
      3,
      [],
      [],
      0,
      {},
    );
    expect(d.score).toBeGreaterThan(70);
    expect(d.homonymRisk).toBe("high");
  });

  it("penalizes unanchored common name", () => {
    const hits = [baseHit({ classification: "possible", anchorSignals: [], relevanceScore: 40 })];
    const anchored = disambiguate(JOHN_DOE, [baseHit({})], 2, [], [], 0, {}).score;
    const bare = disambiguate({ firstName: "John", lastName: "Doe" }, hits, 0, [], []).score;
    expect(anchored).toBeGreaterThan(bare);
  });

  it("returns higher score with anchors than without", () => {
    const hits = [baseHit({})];
    expect(disambiguate(JOHN_DOE, hits, 1, [], [], 0, {}).score).toBeGreaterThan(
      disambiguate({ firstName: "John", lastName: "Doe" }, hits, 0, [], []).score,
    );
  });
});