import { describe, expect, it } from "vitest";
import { buildScoreBreakdown } from "../modules/score-breakdown.js";

describe("buildScoreBreakdown", () => {
  it("clamps score to 0-100", () => {
    const high = buildScoreBreakdown([
      { id: "a", label: "A", delta: 90, category: "anchor" },
    ]);
    expect(high.finalScore).toBe(100);

    const low = buildScoreBreakdown([
      { id: "p", label: "P", delta: -50, category: "penalty" },
    ]);
    expect(low.finalScore).toBe(0);
  });

  it("summarizes positive and negative components", () => {
    const b = buildScoreBreakdown([
      { id: "a", label: "Email", delta: 22, category: "anchor" },
      { id: "p", label: "Common name", delta: -12, category: "penalty" },
    ]);
    expect(b.summary).toContain("+22");
    expect(b.summary).toContain("-12");
  });
});