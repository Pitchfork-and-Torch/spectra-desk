import { describe, expect, it } from "vitest";
import { SHERLOCK_SITES } from "../modules/sherlock-sites.js";

describe("sherlock-sites", () => {
  it("exports 50+ public profile probe targets", () => {
    expect(SHERLOCK_SITES.length).toBeGreaterThanOrEqual(50);
    const platforms = new Set(SHERLOCK_SITES.map((s) => s.platform));
    expect(platforms.size).toBe(SHERLOCK_SITES.length);
  });

  it("builds valid URLs for sample username", () => {
    const sample = SHERLOCK_SITES.find((s) => s.platform === "Instagram")!;
    expect(sample.url("testuser")).toBe("https://www.instagram.com/testuser/");
  });
});