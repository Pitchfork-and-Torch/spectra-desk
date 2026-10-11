import { describe, expect, it } from "vitest";
import { assessLinkOwnership, handleMatchesSubject } from "../modules/link-ownership.js";
import { ANCHOR_DOMAIN, JOHN_DOE } from "./test-subjects.js";

const subject = JOHN_DOE;

describe("link-ownership", () => {
  it("matches music-style handles to subject", () => {
    expect(handleMatchesSubject("JohnDoeMusic", subject)).toBe(true);
    expect(handleMatchesSubject("johndoe", subject)).toBe(true);
  });

  it("marks collaborator recommendation links", () => {
    const a = assessLinkOwnership(
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
      subject,
    );
    expect(a.ownership).toBe("collaborator");
  });

  it("marks self-claimed rel-me style links with matching handle", () => {
    const a = assessLinkOwnership(
      {
        url: "https://www.youtube.com/@JohnDoeMusic",
        platform: "YouTube",
        handle: "JohnDoeMusic",
        confidence: 90,
        source: "rel-me",
        pageUrl: `https://${ANCHOR_DOMAIN}/`,
        linkRole: "self",
      },
      subject,
    );
    expect(a.ownership).toBe("self-claimed");
  });
});