import { describe, expect, it } from "vitest";
import {
  applyPortraitUserAssignments,
  buildPortraitClusters,
  buildPortraitDisambiguation,
} from "../modules/portrait-disambiguation.js";
import type { PortraitCandidate, PortraitIntel } from "../types.js";

const base = (overrides: Partial<PortraitCandidate>): PortraitCandidate => ({
  id: "p1",
  label: "Test",
  platform: "Web",
  imageUrl: "https://example.com/i.jpg",
  role: "subject-account",
  matchVerdict: "unknown",
  userAssignment: "pending",
  ...overrides,
});

describe("portrait-disambiguation", () => {
  it("clusters pending and assigned portraits", () => {
    const clusters = buildPortraitClusters([
      base({ id: "anchor", role: "anchor", userAssignment: "subject", matchVerdict: "matches-anchor" }),
      base({ id: "other", userAssignment: "homonym", matchVerdict: "distinct-person" }),
      base({ id: "pending", similarityToAnchor: 0.2, matchVerdict: "distinct-person" }),
    ]);
    expect(clusters.some((c) => c.kind === "subject")).toBe(true);
    expect(clusters.some((c) => c.kind === "homonym")).toBe(true);
  });

  it("applies user assignments and rebuilds disambiguation", () => {
    const intel: PortraitIntel = {
      candidates: [base({ id: "a" }), base({ id: "b", role: "homonym" })],
      homonymProfiles: [],
      summary: "test",
      method: "dhash",
      collectedAt: new Date().toISOString(),
    };
    const updated = applyPortraitUserAssignments(intel, [{ portraitId: "a", assignment: "subject" }]);
    expect(updated.candidates.find((c) => c.id === "a")?.userAssignment).toBe("subject");
    const dis = buildPortraitDisambiguation(updated);
    expect(dis?.userRefined).toBe(true);
  });
});