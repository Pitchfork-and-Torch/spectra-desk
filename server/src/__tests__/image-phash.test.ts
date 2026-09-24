import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  computeDHash,
  hammingDistance,
  hashSimilarity,
  verdictFromSimilarity,
} from "../modules/image-phash.js";

async function solidPng(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

describe("image-phash", () => {
  it("produces identical hashes for same image", async () => {
    const buf = await solidPng(40, 80, 120);
    const a = await computeDHash(buf);
    const b = await computeDHash(buf);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("distinguishes structurally different images", async () => {
    const leftDark = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([{ input: { create: { width: 16, height: 32, channels: 3, background: { r: 255, g: 255, b: 255 } } }, left: 16, top: 0 }])
      .png()
      .toBuffer();
    const rightDark = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([{ input: { create: { width: 16, height: 32, channels: 3, background: { r: 0, g: 0, b: 0 } } }, left: 16, top: 0 }])
      .png()
      .toBuffer();
    const a = await computeDHash(leftDark);
    const b = await computeDHash(rightDark);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(hashSimilarity(a!, b!)).toBeLessThan(0.85);
  });

  it("maps similarity to verdicts", () => {
    expect(verdictFromSimilarity(0.9, true)).toBe("matches-anchor");
    expect(verdictFromSimilarity(0.7, true)).toBe("likely-same");
    expect(verdictFromSimilarity(0.3, true)).toBe("distinct-person");
    expect(verdictFromSimilarity(0.9, false)).toBe("unknown");
  });

  it("computes hamming distance", () => {
    expect(hammingDistance("1010", "1010")).toBe(0);
    expect(hammingDistance("1010", "0101")).toBe(4);
  });
});