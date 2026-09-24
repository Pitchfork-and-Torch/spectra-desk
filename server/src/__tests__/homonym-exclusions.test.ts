import { describe, expect, it } from "vitest";
import {
  filterWikipediaResults,
  isGenericXHomonymHandle,
  wikipediaSearchQuery,
} from "../modules/homonym-exclusions.js";
import { JOHN_DOE } from "./test-subjects.js";

describe("homonym-exclusions", () => {
  it("flags generic X homonym handles for John Doe", () => {
    expect(isGenericXHomonymHandle("john_doe", JOHN_DOE)).toBe(true);
    expect(isGenericXHomonymHandle("jdoe", JOHN_DOE)).toBe(true);
    expect(isGenericXHomonymHandle("JohnDoeOfficial", JOHN_DOE)).toBe(false);
  });

  it("uses disambiguated Wikipedia query for common names", () => {
    const q = wikipediaSearchQuery(JOHN_DOE);
    expect(q).toContain("musician");
    expect(q).toContain("Springfield");
  });

  it("excludes voice-actor Wikipedia homonyms", () => {
    const { relevant, excluded } = filterWikipediaResults(JOHN_DOE, [
      {
        title: "John Doe (voice actor)",
        url: "https://en.wikipedia.org/wiki/John_Doe_(voice_actor)",
        description: "American voice actor, Epic Voice Guy",
      },
      {
        title: "Example profile",
        url: "https://example.com",
        description: "Folk musician in Springfield, Illinois",
      },
    ]);
    expect(relevant.length).toBe(1);
    expect(excluded.length).toBe(1);
    expect(excluded[0].title).toContain("voice actor");
  });
});