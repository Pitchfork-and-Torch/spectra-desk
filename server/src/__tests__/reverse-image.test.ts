import { describe, expect, it } from "vitest";
import { buildReverseImageQueries, buildReverseImagePack } from "../modules/reverse-image.js";

describe("reverse-image", () => {
  it("builds yandex and google lens public URLs", () => {
    const qs = buildReverseImageQueries("https://example.com/face.jpg");
    expect(qs.some((q) => q.engine === "yandex" && q.pageUrl.includes("yandex.com"))).toBe(true);
    expect(qs.some((q) => q.engine === "google-lens" && q.pageUrl.includes("lens.google"))).toBe(true);
    expect(qs.some((q) => q.engine === "tineye")).toBe(true);
  });

  it("packs multiple source images", () => {
    const pack = buildReverseImagePack([
      "https://a.example/1.jpg",
      "https://a.example/1.jpg",
      "https://b.example/2.jpg",
    ]);
    expect(pack.sourceCount).toBe(2);
    expect(pack.queries.length).toBeGreaterThan(4);
  });
});
