import { describe, expect, it } from "vitest";
import { scoreAccount } from "../modules/account-scoring.js";
import { ANCHOR_DOMAIN, JOHN_DOE } from "./test-subjects.js";

describe("account-scoring", () => {
  it("quarantines http-probe without corroboration", () => {
    const s = scoreAccount(
      {
        platform: "Twitch",
        username: "johndoe-dev",
        url: "https://www.twitch.tv/johndoe-dev",
        exists: true,
        confidence: 68,
        method: "http-probe",
      },
      JOHN_DOE,
      { anchorDomain: ANCHOR_DOMAIN },
    );
    expect(s.tier).toBe("quarantined");
  });

  it("attributes site-link discovery", () => {
    const s = scoreAccount(
      {
        platform: "YouTube",
        username: "JohnDoeMusic",
        url: "https://www.youtube.com/@JohnDoeMusic",
        exists: true,
        confidence: 93,
        method: "site-link",
      },
      { firstName: "John", lastName: "Doe", employer: ANCHOR_DOMAIN },
      {
        siteLinks: [
          {
            url: "https://www.youtube.com/@JohnDoeMusic",
            platform: "YouTube",
            handle: "JohnDoeMusic",
            confidence: 88,
            source: "footer",
            pageUrl: `https://${ANCHOR_DOMAIN}`,
          },
        ],
        anchorDomain: ANCHOR_DOMAIN,
      },
    );
    expect(s.tier).toBe("attributed");
    expect(s.posterior).toBeGreaterThan(0.7);
  });

  it("downgrades collaborator site links", () => {
    const s = scoreAccount(
      {
        platform: "YouTube",
        username: "PPLongIsland",
        url: "https://www.youtube.com/@PPLongIsland",
        exists: true,
        confidence: 55,
        method: "site-link",
        bio: "Linked on subject site (recommendation) - associate/colleague; ownership unverified",
      },
      JOHN_DOE,
      {
        siteLinks: [
          {
            url: "https://www.youtube.com/@PPLongIsland",
            platform: "YouTube",
            handle: "PPLongIsland",
            confidence: 55,
            source: "body",
            pageUrl: `https://${ANCHOR_DOMAIN}/`,
            linkRole: "collaborator",
            contextHint: "recommendation",
          },
        ],
        anchorDomain: ANCHOR_DOMAIN,
      },
    );
    expect(s.tier).not.toBe("attributed");
    expect(s.linkOwnership).toBe("collaborator");
  });

  it("attributes X profile via brand match", () => {
    const s = scoreAccount(
      {
        platform: "Twitter/X",
        username: "JohnDoeOfficial",
        url: "https://x.com/JohnDoeOfficial",
        exists: true,
        confidence: 88,
        method: "platform-resolver",
        displayName: "johndoe-dev | John Doe",
      },
      JOHN_DOE,
      {},
    );
    expect(s.tier).toBe("attributed");
    expect(s.evidence.some((e) => e.id === "brand-match-x")).toBe(true);
  });

  it("quarantines builtin wrong @john_doe for John Doe", () => {
    const s = scoreAccount(
      {
        platform: "Twitter/X",
        username: "john_doe",
        url: "https://x.com/john_doe",
        exists: true,
        confidence: 88,
        method: "platform-resolver",
        displayName: "John Doe",
      },
      JOHN_DOE,
      {},
    );
    expect(s.tier).toBe("quarantined");
    expect(s.posterior).toBeLessThan(0.15);
  });

  it("demotes generic homonym X accounts when brand anchor exists", () => {
    const brand = scoreAccount(
      {
        platform: "Twitter/X",
        username: "JohnDoeOfficial",
        url: "https://x.com/JohnDoeOfficial",
        exists: true,
        confidence: 88,
        method: "platform-resolver",
        displayName: "johndoe-dev",
      },
      JOHN_DOE,
      {},
    );
    const homonym = scoreAccount(
      {
        platform: "Twitter/X",
        username: "john_doe",
        url: "https://x.com/john_doe",
        exists: true,
        confidence: 88,
        method: "platform-resolver",
        displayName: "John Doe",
      },
      JOHN_DOE,
      {},
    );
    expect(brand.posterior).toBeGreaterThan(homonym.posterior);
  });

  it("boosts accounts with matching anchor portrait", () => {
    const base = scoreAccount(
      {
        platform: "Twitter/X",
        username: "JohnDoeOfficial",
        url: "https://x.com/JohnDoeOfficial",
        exists: true,
        confidence: 88,
        method: "platform-resolver",
        displayName: "johndoe-dev",
      },
      JOHN_DOE,
      {},
    );
    const withPortrait = scoreAccount(
      {
        platform: "Twitter/X",
        username: "JohnDoeOfficial",
        url: "https://x.com/JohnDoeOfficial",
        exists: true,
        confidence: 88,
        method: "platform-resolver",
        displayName: "johndoe-dev",
      },
      JOHN_DOE,
      { portraitSimilarity: 0.88, portraitVerdict: "matches-anchor" },
    );
    expect(withPortrait.posterior).toBeGreaterThan(base.posterior);
    expect(withPortrait.evidence.some((e) => e.id === "portrait-match")).toBe(true);
  });

  it("penalizes visually distinct homonym portraits", () => {
    const s = scoreAccount(
      {
        platform: "Twitter/X",
        username: "john_doe",
        url: "https://x.com/john_doe",
        exists: true,
        confidence: 70,
        method: "platform-resolver",
        displayName: "John Doe",
      },
      JOHN_DOE,
      { portraitSimilarity: 0.25, portraitVerdict: "distinct-person" },
    );
    expect(s.tier).toBe("quarantined");
    expect(s.evidence.some((e) => e.id === "portrait-distinct")).toBe(true);
  });
});