import { describe, expect, it } from "vitest";
import { assessPortraitUrlQuality, filterGalleryPortraits } from "../modules/portrait-quality.js";

describe("portrait-quality", () => {
  it("rejects YouTube brand logo URLs from the Dustin failure mode", () => {
    const q = assessPortraitUrlQuality("https://www.youtube.com/img/desktop/yt_1200.png", {
      label: "YouTube",
      profileUrl: "https://www.youtube.com/",
    });
    expect(q.isPlatformLogo).toBe(true);
    expect(q.isLikelyFace).toBe(false);
  });

  it("rejects Google Play listing art", () => {
    const q = assessPortraitUrlQuality(
      "https://play-lh.googleusercontent.com/QNmuZQc9I6Zbe3mWnSr0hycnENqGFCI5p3yE29Hkxt",
      { label: "YouTube - Apps on Google Play", profileUrl: "https://play.google.com/store/apps/details?id=com.google.android.youtube" },
    );
    expect(q.isPlatformLogo).toBe(true);
  });

  it("keeps GitHub avatars as plausible faces", () => {
    const q = assessPortraitUrlQuality("https://avatars.githubusercontent.com/u/12345?v=4", {
      label: "octocat",
      platform: "GitHub",
      profileUrl: "https://github.com/octocat",
    });
    expect(q.isPlatformLogo).toBe(false);
    expect(q.isLikelyFace).toBe(true);
  });

  it("filterGalleryPortraits drops logos and keeps faces", () => {
    const { kept, rejected } = filterGalleryPortraits([
      {
        id: "1",
        label: "YouTube",
        platform: "Web search",
        profileUrl: "https://www.youtube.com/",
        imageUrl: "https://www.youtube.com/img/desktop/yt_1200.png",
        role: "corroborating",
        matchVerdict: "unknown",
      },
      {
        id: "2",
        label: "GitHub",
        platform: "GitHub",
        profileUrl: "https://github.com/foo",
        imageUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        role: "subject-account",
        matchVerdict: "unknown",
      },
    ]);
    expect(rejected.length).toBe(1);
    expect(kept.length).toBe(1);
    expect(kept[0]?.id).toBe("2");
  });
});
