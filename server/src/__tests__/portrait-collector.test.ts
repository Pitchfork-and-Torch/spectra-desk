import { describe, expect, it } from "vitest";
import { collectPortraitSourceUrls, unavatarUrl } from "../modules/portrait-collector.js";
import { parseXProfileImage } from "../modules/x-resolver.js";
import { ANCHOR_DOMAIN, JOHN_DOE } from "./test-subjects.js";

describe("portrait-collector", () => {
  it("builds unavatar URLs per platform", () => {
    expect(unavatarUrl("Twitter/X", "JohnDoeOfficial")).toBe("https://unavatar.io/x/JohnDoeOfficial");
    expect(unavatarUrl("GitHub", "johndoe")).toBe("https://unavatar.io/github/johndoe");
    expect(unavatarUrl("Steam", "foo")).toBeNull();
  });

  it("collects anchor og:image and account portraits", () => {
    const sources = collectPortraitSourceUrls(JOHN_DOE, {
      siteFp: {
        domain: ANCHOR_DOMAIN,
        ogImageUrl: "/assets/og-preview.jpg",
        pressImageUrls: [],
        locationPhrases: [],
        professionPhrases: [],
        uniquePhrases: [],
        albumTitles: [],
        songTitles: [],
        socialLinks: [],
        allExternalLinks: [],
        pagesCrawled: [],
        robotsRespected: true,
        rawTextSample: "",
      },
      usernameProbes: [
        {
          platform: "Twitter/X",
          username: "JohnDoeOfficial",
          url: "https://x.com/JohnDoeOfficial",
          exists: true,
          confidence: 95,
          method: "platform-resolver",
          displayName: "johndoe-dev",
        },
      ],
    });
    expect(sources.some((s) => s.role === "anchor" && s.imageUrl.includes("og-preview"))).toBe(true);
    expect(sources.some((s) => s.handle === "JohnDoeOfficial")).toBe(true);
    expect(sources.some((s) => s.role === "homonym" && s.handle === "john_doe")).toBe(true);
  });
});

describe("parseXProfileImage", () => {
  it("extracts og:image from X HTML", () => {
    const html = `<meta property="og:image" content="https://pbs.twimg.com/profile_images/abc/normal.jpg"/>`;
    expect(parseXProfileImage(html)).toContain("pbs.twimg.com");
  });
});