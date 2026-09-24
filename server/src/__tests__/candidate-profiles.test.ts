import { describe, expect, it } from "vitest";
import { buildCandidateProfiles, buildIdentityWorkbench, applyIdentitySelection } from "../modules/candidate-profiles.js";
import type { OsintReport } from "../types.js";
import { ANCHOR_DOMAIN, JOHN_DOE } from "./test-subjects.js";

function minimalReport(overrides: Partial<OsintReport> = {}): OsintReport {
  return {
    id: "test-1",
    subject: { ...JOHN_DOE },
    createdAt: new Date().toISOString(),
    status: "complete",
    disambiguation: {
      score: 55,
      label: "Moderate",
      rationale: [],
      distinguishingSignals: [],
      homonymRisk: "high",
      candidates: [
        {
          id: "hit-0",
          label: "John Doe - Developer at Example Corp",
          sourceUrl: `https://${ANCHOR_DOMAIN}/about`,
          snippet: "John Doe is a software developer based in Austin, Texas",
          signals: ["location:Austin"],
          matchScore: 72,
        },
        {
          id: "hit-1",
          label: "John Doe - Voice Actor",
          sourceUrl: "https://imdb.com/name/johndoe",
          snippet: "John Doe is a voice actor in Los Angeles",
          signals: [],
          matchScore: 45,
        },
      ],
      questions: [],
      refined: false,
    },
    executiveSummary: "Test",
    searchHits: [
      {
        title: "John Doe developer",
        url: `https://${ANCHOR_DOMAIN}/about`,
        snippet: "Developer in Austin at Example Corp",
        source: "test",
        query: "q",
        classification: "corroborated",
      },
      {
        title: "John Doe voice actor LA",
        url: "https://imdb.com/name/johndoe",
        snippet: "Voice actor Los Angeles",
        source: "test",
        query: "q",
        classification: "possible",
      },
      {
        title: "TechCrunch: John Doe raises seed",
        url: "https://techcrunch.com/john-doe-seed",
        snippet: "John Doe founder Austin 2024",
        source: "test",
        query: "q",
        classification: "possible",
      },
    ],
    socialCandidates: [],
    evidence: [],
    sourceInventory: [],
    markdown: "",
    html: "",
    usernameProbes: [
      {
        platform: "github",
        username: "johndoe-dev",
        url: "https://github.com/johndoe-dev",
        exists: true,
        displayName: "John Doe",
        bio: "Developer in Austin",
        location: "Austin, TX",
        confidence: 85,
        method: "api",
      },
      {
        platform: "imdb",
        username: "johndoe",
        url: "https://imdb.com/name/johndoe",
        exists: true,
        displayName: "John Doe",
        bio: "Voice actor",
        location: "Los Angeles",
        confidence: 40,
        method: "http-probe",
      },
    ],
    scoredAccounts: [
      {
        platform: "github",
        username: "johndoe-dev",
        url: "https://github.com/johndoe-dev",
        posterior: 0.82,
        tier: "attributed",
        evidence: [],
        displayName: "John Doe",
        linkOwnership: "self-claimed",
      },
    ],
    ...overrides,
  };
}

describe("candidate-profiles", () => {
  it("surfaces separate ranked profiles instead of mixing hits", () => {
    const profiles = buildCandidateProfiles(minimalReport());
    expect(profiles.length).toBeGreaterThanOrEqual(2);
    const dev = profiles.find((p) => p.displayName.includes("Developer") || p.locations.some((l) => /austin/i.test(l)));
    const actor = profiles.find((p) => p.displayName.includes("Voice") || p.locations.some((l) => /los angeles/i.test(l)));
    expect(dev).toBeDefined();
    expect(actor).toBeDefined();
    expect(dev!.likelihood).toBeGreaterThan(actor!.likelihood);
    expect(dev!.accounts.some((a) => a.platform === "github")).toBe(true);
  });

  it("includes transparent reasoning and edge flags for common names", () => {
    const wb = buildIdentityWorkbench(minimalReport());
    expect(wb.required).toBe(true);
    expect(wb.profiles[0]?.reasoning.length).toBeGreaterThan(0);
    expect(wb.profiles.some((p) => p.edgeCaseFlags.includes("common-name"))).toBe(true);
  });

  it("locks identity on confirmation", () => {
    const wb = buildIdentityWorkbench(minimalReport());
    const top = wb.profiles[0]!;
    const locked = applyIdentitySelection(wb, top.id, wb.profiles.slice(1).map((p) => p.id));
    expect(locked.confirmed).toBe(true);
    expect(locked.required).toBe(false);
    expect(locked.profiles.find((p) => p.id === top.id)?.userAssignment).toBe("target");
    expect(locked.profiles.filter((p) => p.userAssignment === "excluded").length).toBeGreaterThan(0);
  });

  it("extracts aliases from subject name variants", () => {
    const profiles = buildCandidateProfiles(minimalReport());
    expect(profiles[0]?.aliases.some((a) => /John/i.test(a))).toBe(true);
  });
});