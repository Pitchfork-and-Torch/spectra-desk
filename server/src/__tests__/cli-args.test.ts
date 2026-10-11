import { describe, expect, it } from "vitest";
import { normalizeInvestigationInput, parseCliFlags, resolveQueryMode } from "../lib/cli-args.js";

describe("parseCliFlags", () => {
  it("parses --key=value without separate tokens", () => {
    const f = parseCliFlags(["--first=John", "--last=Doe", "--mode=fast", "--domain=example.com"]);
    expect(f.first).toBe("John");
    expect(f.mode).toBe("fast");
    expect(f.domain).toBe("example.com");
  });

  it("parses -m short flag", () => {
    const f = parseCliFlags(["-m", "validation", "--first", "Tim"]);
    expect(f.mode).toBe("validation");
    expect(f.first).toBe("Tim");
  });

  it("parses key=value without dashes", () => {
    const f = parseCliFlags(["mode=fast", "first=John"]);
    expect(f.mode).toBe("fast");
    expect(f.first).toBe("John");
  });
});

describe("normalizeInvestigationInput", () => {
  it("maps short names and promotes domain to employer", () => {
    const raw = normalizeInvestigationInput({ first: "John", last: "Doe", domain: "example.com", mode: "fast" });
    expect(raw.firstName).toBe("John");
    expect(raw.employer).toBe("example.com");
    expect(raw.mode).toBe("fast");
  });

  it("extracts site: from notes and strips shell quotes", () => {
    const raw = normalizeInvestigationInput({ notes: '\\"site:example.com\\"', mode: "fast" });
    expect(raw.employer).toBe("example.com");
  });
});

describe("resolveQueryMode", () => {
  it("respects explicit mode over env", () => {
    expect(resolveQueryMode({ mode: "fast" })).toBe("fast");
  });
});