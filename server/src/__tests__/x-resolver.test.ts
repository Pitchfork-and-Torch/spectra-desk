import { describe, expect, it } from "vitest";
import { generateXHandleCandidates, parseXProfileTitle } from "../modules/x-resolver.js";
import { JOHN_DOE } from "./test-subjects.js";

describe("x-resolver", () => {
  it("parses X profile title from HTML", () => {
    const html = `<html><head><title>johndoe-dev (@JohnDoeOfficial) / X</title></head></html>`;
    const meta = parseXProfileTitle(html, "johndoeofficial");
    expect(meta?.handle).toBe("JohnDoeOfficial");
    expect(meta?.displayName).toContain("johndoe-dev");
  });

  it("generates brand handle candidates from username anchor", () => {
    const candidates = generateXHandleCandidates(
      JOHN_DOE,
      { uniquePhrases: ["acme records"] } as import("../modules/website-profiler.js").SiteFingerprint,
    );
    expect(candidates).toContain("johndoedev");
    expect(candidates).toContain("johnofficial");
  });
});