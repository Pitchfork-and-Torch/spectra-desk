import { describe, expect, it } from "vitest";
import { contentSimilarity } from "../modules/content-fingerprint.js";

describe("content-fingerprint", () => {
  it("scores overlapping musician corpus", () => {
    const site = "John Doe folk singer Springfield album North Wind song River Song sample album";
    const twitch = "Streaming River Song from the North Wind album - John Doe musician";
    expect(contentSimilarity(site, twitch)).toBeGreaterThan(0.4);
  });
});