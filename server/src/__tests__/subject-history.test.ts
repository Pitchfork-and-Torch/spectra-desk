import { describe, expect, it } from "vitest";
import {
  applyPortraitMemory,
  subjectKey,
  mergePortraitAssignments,
} from "../modules/subject-history.js";
import type { PortraitCandidate } from "../types.js";

describe("subject-history", () => {
  it("builds stable subject keys", () => {
    expect(subjectKey("John", "Doe")).toBe("john|doe");
  });

  it("applies portrait memory by dHash", () => {
    const candidates: PortraitCandidate[] = [
      {
        id: "p1",
        label: "Face A",
        platform: "GitHub",
        imageUrl: "https://example.com/a.jpg",
        role: "subject-account",
        matchVerdict: "unknown",
        dHash: "abc123",
        userAssignment: "pending",
      },
    ];
    const out = applyPortraitMemory(candidates, [
      {
        dHash: "abc123",
        assignment: "homonym",
        label: "Face A",
        lastSeenAt: new Date().toISOString(),
      },
    ]);
    expect(out[0].userAssignment).toBe("homonym");
    expect(out[0].matchVerdict).toBe("distinct-person");
  });

  it("merges portrait assignment rows", () => {
    const merged = mergePortraitAssignments(
      [{ dHash: "x", assignment: "subject", label: "old", lastSeenAt: "2020-01-01" }],
      [{ portraitId: "p1", assignment: "homonym", dHash: "x", label: "new" }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].assignment).toBe("homonym");
    expect(merged[0].label).toBe("new");
  });
});