import { describe, expect, it } from "vitest";
import { disambiguate } from "../modules/disambiguate.js";
import { buildCandidateProfiles, buildIdentityWorkbench } from "../modules/candidate-profiles.js";
import { scoreAllAccounts } from "../modules/account-scoring.js";
import { mergeSocial, discoverFromSearch } from "../modules/social.js";
import type { OsintReport, SearchHit, SubjectInput, UsernameProbe } from "../types.js";

const DUSTIN: SubjectInput = { firstName: "Dustin", lastName: "Daprizio", city: "Tampa", state: "FL" };

function syntheticDustinReport(): OsintReport {
  const hits: SearchHit[] = [
    {
      title: "Dustin Daprizio - Business Owner | LinkedIn",
      url: "https://www.linkedin.com/in/dustin-daprizio-tampa",
      snippet: "Tampa, Florida · Business owner",
      source: "test",
      query: "linkedin",
      relevanceScore: 92,
      classification: "corroborated",
      anchorSignals: ["location:Tampa, FL"],
    },
    {
      title: "dustindaprizio · GitHub",
      url: "https://github.com/dustindaprizio",
      snippet: "GitHub profile - no name match",
      source: "test",
      query: "github",
      relevanceScore: 48,
      classification: "possible",
    },
  ];

  const probes: UsernameProbe[] = [
    {
      platform: "GitHub",
      username: "dustindaprizio",
      url: "https://github.com/dustindaprizio",
      exists: false,
      confidence: 18,
      method: "api",
      bio: "[GitHub user exists but name/location mismatch]",
    },
  ];

  const disamb = disambiguate(DUSTIN, hits, 0, [], [], 0, {});

  return {
    id: "test-dustin",
    subject: DUSTIN,
    createdAt: new Date().toISOString(),
    status: "complete",
    disambiguation: disamb,
    executiveSummary: "",
    searchHits: hits,
    excludedHits: [],
    socialCandidates: mergeSocial(discoverFromSearch(hits, DUSTIN), []),
    usernameProbes: probes,
    scoredAccounts: scoreAllAccounts(probes, DUSTIN),
    evidence: [],
    sourceInventory: [],
    markdown: "",
    html: "",
  };
}

describe("disambiguation workflow (Dustin-class)", () => {
  it("ranks LinkedIn first through full workbench pipeline", () => {
    const report = syntheticDustinReport();
    expect(report.disambiguation.candidates[0]?.sourceUrl).toMatch(/linkedin\.com\/in\//);

    const profiles = buildCandidateProfiles(report);
    expect(profiles[0]?.primaryUrl).toMatch(/linkedin\.com\/in\//);

    const workbench = buildIdentityWorkbench(report);
    expect(workbench.profiles[0]?.id).toBe(profiles[0]?.id);
    expect(workbench.profiles[0]?.primaryUrl).toMatch(/linkedin\.com\/in\//);
    expect(workbench.profiles[0]?.likelihood).toBeGreaterThan(50);
  });

  it("quarantines false-positive GitHub from social output", () => {
    const report = syntheticDustinReport();
    const ghSocial = report.socialCandidates.find((s) => s.url.includes("github.com"));
    const ghProbe = report.usernameProbes?.find((p) => p.platform === "GitHub");
    expect(ghProbe?.exists).toBe(false);
    if (ghSocial) expect(ghSocial.confidence).toBeLessThan(50);
  });
});