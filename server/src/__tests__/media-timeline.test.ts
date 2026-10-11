import { describe, expect, it } from "vitest";
import { buildMediaTimeline } from "../modules/media-timeline.js";
import type { OsintReport } from "../types.js";
import { JOHN_DOE } from "./test-subjects.js";

describe("media-timeline", () => {
  it("builds chronological media entries from news hits", () => {
    const report = {
      subject: JOHN_DOE,
      searchHits: [
        {
          title: "John Doe raises seed round - TechCrunch 2024",
          url: "https://techcrunch.com/john-doe-2024",
          snippet: "Austin-based founder John Doe announced funding",
          source: "test",
          query: "q",
          classification: "corroborated",
        },
        {
          title: "Random page",
          url: "https://example.com/page",
          snippet: "unrelated",
          source: "test",
          query: "q",
        },
      ],
    } as unknown as OsintReport;

    const tl = buildMediaTimeline(report);
    expect(tl.entries.length).toBeGreaterThanOrEqual(1);
    expect(tl.entries[0]?.outlet).toContain("techcrunch");
    expect(tl.summary).toMatch(/media mention/i);
  });
});