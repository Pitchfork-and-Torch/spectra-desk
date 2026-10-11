import { describe, expect, it } from "vitest";
import { platformRelevanceBoost, githubProbeMatchesSubject, locationMatchesText } from "../modules/platform-scoring.js";
import { scoreHitRelevance } from "../modules/enrich.js";
import { disambiguate } from "../modules/disambiguate.js";
import { nameMatchesInText } from "../modules/name-variants.js";
import type { SearchHit } from "../types.js";

const DUSTIN = { firstName: "Dustin", lastName: "Daprizio", city: "Tampa", state: "FL" };

describe("platform-scoring", () => {
  it("boosts LinkedIn with Tampa location over bare GitHub username hit", () => {
    const linkedIn = platformRelevanceBoost(
      {
        title: "Dustin Daprizio - Business Owner | LinkedIn",
        url: "https://www.linkedin.com/in/dustin-daprizio-abc123",
        snippet: "Tampa, Florida · Business owner at Example Co",
      },
      DUSTIN,
    );
    const github = platformRelevanceBoost(
      {
        title: "dustindaprizio (GitHub)",
        url: "https://github.com/dustindaprizio",
        snippet: "GitHub profile",
      },
      DUSTIN,
    );
    expect(linkedIn.boost).toBeGreaterThan(github.boost);
    expect(linkedIn.signals.some((s) => s.startsWith("location:"))).toBe(true);
  });

  it("rejects GitHub probe when display name does not match subject", () => {
    expect(
      githubProbeMatchesSubject(
        { displayName: "Some Other Person", bio: "Developer", method: "api" },
        DUSTIN,
      ),
    ).toBe(false);
    expect(
      githubProbeMatchesSubject(
        { displayName: "Dustin Daprizio", location: "Tampa, FL", method: "api" },
        DUSTIN,
      ),
    ).toBe(true);
  });

  it("ranks LinkedIn candidate above GitHub in disambiguation", () => {
    const hits: SearchHit[] = [
      {
        title: "dustindaprizio · GitHub",
        url: "https://github.com/dustindaprizio",
        snippet: "GitHub profile",
        source: "test",
        query: "q",
        relevanceScore: 55,
        classification: "possible",
      },
      {
        title: "Dustin Daprizio | LinkedIn",
        url: "https://www.linkedin.com/in/dustin-daprizio-xyz",
        snippet: "Tampa, Florida · Owner at Example Business",
        source: "test",
        query: "q",
        relevanceScore: 88,
        classification: "corroborated",
        anchorSignals: ["location:Tampa, FL"],
      },
    ];
    const d = disambiguate(DUSTIN, hits, 0, [], [], 0, {});
    expect(d.candidates[0]?.sourceUrl).toMatch(/linkedin\.com\/in\//);
    expect(scoreHitRelevance(hits[1]!, DUSTIN, nameMatchesInText)).toBeGreaterThan(
      scoreHitRelevance(hits[0]!, DUSTIN, nameMatchesInText),
    );
  });

  it("detects Tampa in location text", () => {
    expect(locationMatchesText("Based in Tampa, Florida", DUSTIN)).toBe(true);
  });
});