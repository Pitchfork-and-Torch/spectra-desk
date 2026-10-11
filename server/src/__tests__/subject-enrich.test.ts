import { describe, expect, it } from "vitest";
import { cleanFlagValue, domainsFromText, enrichSubjectRaw } from "../modules/subject-enrich.js";
import { ANCHOR_DOMAIN } from "./test-subjects.js";

describe("subject-enrich", () => {
  it("extracts domain from site: hint", () => {
    expect(domainsFromText(`focus site:${ANCHOR_DOMAIN} please`)).toContain(ANCHOR_DOMAIN);
  });

  it("extracts domain from URL", () => {
    expect(domainsFromText(`see https://${ANCHOR_DOMAIN}/about`)).toContain(ANCHOR_DOMAIN);
  });

  it("promotes domain to employer and website", () => {
    const r = enrichSubjectRaw({ firstName: "John", domain: ANCHOR_DOMAIN });
    expect(r.employer).toBe(ANCHOR_DOMAIN);
    expect(r.website).toBe(ANCHOR_DOMAIN);
  });

  it("strips shell quotes from flag values", () => {
    expect(cleanFlagValue(`\\"site:${ANCHOR_DOMAIN}\\"`)).toBe(`site:${ANCHOR_DOMAIN}`);
  });
});