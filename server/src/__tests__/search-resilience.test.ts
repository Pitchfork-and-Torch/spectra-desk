import { describe, expect, it } from "vitest";
import {
  SearchCircuitBreaker,
  assessSearchBatchHealth,
  buildAnchorFallbackHits,
  shouldEarlyStopSearch,
} from "../modules/search-resilience.js";
import { ANCHOR_DOMAIN, JOHN_DOE } from "./test-subjects.js";

describe("SearchCircuitBreaker", () => {
  it("opens after repeated failures", () => {
    const b = new SearchCircuitBreaker(2);
    b.recordFailure("brave");
    expect(b.isOpen("brave")).toBe(false);
    b.recordFailure("brave");
    expect(b.isOpen("brave")).toBe(true);
    b.recordSuccess("brave");
    expect(b.isOpen("brave")).toBe(false);
  });
});

describe("assessSearchBatchHealth", () => {
  it("marks degraded when most queries empty", () => {
    const m = new Map([
      ["a", []],
      ["b", []],
      ["c", []],
      ["d", []],
      ["e", []],
    ]);
    const h = assessSearchBatchHealth(m);
    expect(h.degraded).toBe(true);
    expect(h.withHits).toBe(0);
  });
});

describe("buildAnchorFallbackHits", () => {
  it("emits domain and github anchors", () => {
    const hits = buildAnchorFallbackHits(
      JOHN_DOE,
      {
        login: JOHN_DOE.username,
        url: `https://github.com/${JOHN_DOE.username}`,
        blog: ANCHOR_DOMAIN,
        name: "John Doe",
        bio: null,
        location: null,
        company: null,
        publicRepos: 1,
      },
      { domain: ANCHOR_DOMAIN, url: `https://${ANCHOR_DOMAIN}` },
    );
    expect(hits.some((h) => h.url.includes(ANCHOR_DOMAIN))).toBe(true);
    expect(hits.some((h) => h.url.includes("github.com"))).toBe(true);
  });
});

describe("shouldEarlyStopSearch", () => {
  it("stops when degraded with anchor fallback available", () => {
    const health = { attempted: 6, withHits: 0, empty: 6, degraded: true, fallbackHits: 0 };
    expect(shouldEarlyStopSearch(6, 24, health, true)).toBe(true);
    expect(shouldEarlyStopSearch(6, 24, health, false)).toBe(false);
  });
});