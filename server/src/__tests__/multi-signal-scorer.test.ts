import { describe, expect, it } from "vitest";
import { scoreMultiSignal, lockStatusToTier } from "../modules/multi-signal-scorer.js";

const DUSTIN = { firstName: "Dustin", lastName: "Daprizio", city: "Tampa", state: "FL" };

describe("multi-signal-scorer", () => {
  it("caps structural-only Dustin-class cases and refuses lock", () => {
    const lock = scoreMultiSignal({
      subject: DUSTIN,
      hits: [
        {
          title: "Dustin Daprizio - professional profile search (LinkedIn pivot)",
          url: "https://www.linkedin.com/pub/dir/?first=Dustin&last=Daprizio",
          snippet: "Tampa, FL pivot",
          source: "professional-pivot",
          query: "professional-pivot",
          classification: "corroborated",
        },
      ],
      excludedCount: 3,
      probes: Array.from({ length: 38 }, (_, i) => ({
        platform: "Instagram",
        username: "dustindaprizio",
        url: `https://instagram.com/u${i}`,
        exists: true,
        confidence: 65,
        method: "http-probe" as const,
      })),
      deepProfiles: [],
      portraits: [
        {
          id: "yt",
          label: "YouTube",
          platform: "Web search",
          profileUrl: "https://www.youtube.com/",
          imageUrl: "https://www.youtube.com/img/desktop/yt_1200.png",
          role: "corroborating",
          matchVerdict: "unknown",
        },
      ],
      hasLinkedInPivot: true,
    });

    expect(lock.score).toBeLessThanOrEqual(58);
    expect(lock.status === "insufficient" || lock.status === "possible").toBe(true);
    expect(lock.status).not.toBe("locked");
    expect(lock.scoreCapApplied).toBe(58);
    expect(lock.nextActions.length).toBeGreaterThan(0);
  });

  it("can reach probable with content + location match", () => {
    const lock = scoreMultiSignal({
      subject: DUSTIN,
      hits: [
        {
          title: "Dustin Daprizio MMA Fight History - ESPN",
          url: "https://www.espn.com/mma/fighter/_/id/1/dustin-daprizio",
          snippet: "Florida fighter Dustin Daprizio",
          source: "test",
          query: "q",
          classification: "corroborated",
        },
      ],
      excludedCount: 2,
      probes: [
        {
          platform: "GitHub",
          username: "dustindaprizio",
          url: "https://github.com/dustindaprizio",
          exists: true,
          confidence: 95,
          method: "api",
        },
      ],
      deepProfiles: [
        {
          platform: "GitHub",
          username: "dustindaprizio",
          url: "https://github.com/dustindaprizio",
          exists: true,
          displayName: "Dustin Daprizio",
          bio: "Tampa FL developer",
          locationText: "Tampa, FL",
          avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
          extractedAt: new Date().toISOString(),
          method: "api",
        },
      ],
      portraits: [
        {
          id: "gh",
          label: "GitHub",
          platform: "GitHub",
          profileUrl: "https://github.com/dustindaprizio",
          imageUrl: "https://avatars.githubusercontent.com/u/1?v=4",
          role: "subject-account",
          matchVerdict: "unknown",
        },
      ],
      hasLinkedInPivot: true,
    });

    expect(lock.contentScore).toBeGreaterThan(0);
    expect(lock.score).toBeGreaterThan(58);
    expect(["possible", "probable", "locked"]).toContain(lock.status);
  });

  it("maps lock status to investigator tiers", () => {
    expect(lockStatusToTier("locked")).toBe("confirmed");
    expect(lockStatusToTier("probable")).toBe("likely");
    expect(lockStatusToTier("possible")).toBe("uncertain");
    expect(lockStatusToTier("insufficient")).toBe("insufficient");
  });
});
