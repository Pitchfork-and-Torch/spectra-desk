import { describe, expect, it } from "vitest";
import { deepProfileHasContent, type DeepProfile } from "../modules/deep-profile.js";

describe("deep-profile", () => {
  it("requires real content for attribution", () => {
    const empty: DeepProfile = {
      platform: "Instagram",
      username: "dustindaprizio",
      url: "https://instagram.com/dustindaprizio",
      exists: true,
      extractedAt: new Date().toISOString(),
      method: "http-probe",
    };
    expect(deepProfileHasContent(empty)).toBe(false);

    const rich: DeepProfile = {
      ...empty,
      displayName: "Dustin Daprizio",
      bio: "Tampa FL",
      method: "og-html",
    };
    expect(deepProfileHasContent(rich)).toBe(true);
  });

  it("rejects logo-like avatars as content", () => {
    const logoOnly: DeepProfile = {
      platform: "Web",
      username: "x",
      url: "https://youtube.com/",
      exists: true,
      avatarUrl: "https://www.youtube.com/img/desktop/yt_1200.png",
      extractedAt: new Date().toISOString(),
      method: "og-html",
    };
    expect(deepProfileHasContent(logoOnly)).toBe(false);
  });
});
