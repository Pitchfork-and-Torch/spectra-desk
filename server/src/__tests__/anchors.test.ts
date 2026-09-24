import { describe, expect, it } from "vitest";
import { anchorMatchScore, extractAnchors, hasMinimumAnchors } from "../modules/anchors.js";
import { ANCHOR_DOMAIN, JOHN_DOE } from "./test-subjects.js";

describe("extractAnchors", () => {
  it("extracts domain from employer field", () => {
    const anchors = extractAnchors({ ...JOHN_DOE });
    expect(anchors.domains).toContain(ANCHOR_DOMAIN);
  });

  it("extracts domain from site: directive in notes", () => {
    const anchors = extractAnchors({ notes: `primary site:${ANCHOR_DOMAIN}` });
    expect(anchors.domains).toContain(ANCHOR_DOMAIN);
  });

  it("extracts username from subject", () => {
    const anchors = extractAnchors({ username: JOHN_DOE.username });
    expect(anchors.usernames.length).toBeGreaterThan(0);
  });
});

describe("anchorMatchScore", () => {
  it("scores username match highly", () => {
    const anchors = extractAnchors({ username: "janedoe" });
    const { score, signals } = anchorMatchScore("Jane Doe profile janedoe", "https://github.com/janedoe", anchors);
    expect(score).toBeGreaterThanOrEqual(35);
    expect(signals.some((s) => s.startsWith("username:"))).toBe(true);
  });

  it("scores domain match", () => {
    const anchors = extractAnchors({ employer: ANCHOR_DOMAIN });
    const { score } = anchorMatchScore(`Welcome to ${ANCHOR_DOMAIN}`, `https://${ANCHOR_DOMAIN}/about`, anchors);
    expect(score).toBeGreaterThanOrEqual(30);
  });
});

describe("hasMinimumAnchors", () => {
  it("requires 2 anchors for common names", () => {
    const weak = hasMinimumAnchors({ firstName: "John", lastName: "Smith" });
    expect(weak.sufficientForCommonName).toBe(false);

    const strong = hasMinimumAnchors({
      firstName: "John",
      lastName: "Smith",
      username: "jsmith",
      email: "jsmith@example.com",
    });
    expect(strong.sufficientForCommonName).toBe(true);
  });
});