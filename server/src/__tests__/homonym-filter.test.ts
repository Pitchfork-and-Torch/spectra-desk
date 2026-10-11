import { describe, expect, it } from "vitest";
import { classifyHit, isCommonName } from "../modules/homonym-filter.js";
import { extractAnchors } from "../modules/anchors.js";
import { ANCHOR_DOMAIN, JOHN_DOE } from "./test-subjects.js";

describe("homonym-filter", () => {
  it("flags John Doe as common name", () => {
    expect(isCommonName("John", "Doe")).toBe(true);
    expect(isCommonName("Jane", "Doe")).toBe(true);
  });

  it("corroborates hits with anchor domain", () => {
    const anchors = extractAnchors(JOHN_DOE);
    const { classification } = classifyHit(
      {
        title: "John Doe musician",
        snippet: `${ANCHOR_DOMAIN} folk singer`,
        url: `https://${ANCHOR_DOMAIN}`,
      },
      anchors,
      [`domain:${ANCHOR_DOMAIN}`],
    );
    expect(classification).toBe("corroborated");
  });

  it("marks name-only YouTube as possible without anchor", () => {
    const { classification } = classifyHit(
      { title: "John Doe video", snippet: "", url: "https://youtube.com/watch?v=abc" },
      extractAnchors({ firstName: "John", lastName: "Doe" }),
      [],
    );
    expect(classification).toBe("possible");
  });

  it("excludes first-name comic collisions when surname is absent", () => {
    const { classification, reason } = classifyHit(
      {
        title: "Dustin | Comics Kingdom",
        snippet: "Daily comic strip",
        url: "https://comicskingdom.com/dustin",
      },
      extractAnchors({ firstName: "Dustin", lastName: "Daprizio", city: "Tampa", state: "FL" }),
      [],
      "Daprizio",
    );
    expect(classification).toBe("excluded");
    expect(reason).toMatch(/first-name|comic|entertainment/i);
  });

  it("keeps full-name MMA/public-record hits", () => {
    const { classification } = classifyHit(
      {
        title: "Dustin Daprizio MMA Fight History - ESPN",
        snippet: "Florida fighter profile",
        url: "https://www.espn.com/mma/fighter/_/id/123/dustin-daprizio",
      },
      extractAnchors({ firstName: "Dustin", lastName: "Daprizio", city: "Tampa", state: "FL" }),
      [],
      "Daprizio",
    );
    expect(classification).not.toBe("excluded");
  });
});