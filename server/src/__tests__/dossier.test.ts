import { describe, expect, it } from "vitest";
import { extractFactsFromText } from "../modules/dossier-extract.js";
import { buildSubjectDossier } from "../modules/dossier.js";
import type { OsintReport } from "../types.js";
import { ANCHOR_DOMAIN, JOHN_DOE } from "./test-subjects.js";

describe("dossier-extract", () => {
  it("extracts spouse, child, phone, and email from public text", () => {
    const facts = extractFactsFromText(
      "John Doe is a developer in Austin. Married to Jane Smith. Son Michael Doe. Contact john.doe@example.com or (512) 555-0199.",
      "test article",
    );
    expect(facts.emails.some((e) => e.value.includes("john.doe@"))).toBe(true);
    expect(facts.phones.length).toBeGreaterThan(0);
    expect(facts.relatives.some((r) => r.relation === "spouse" && r.name.includes("Jane"))).toBe(true);
    expect(facts.relatives.some((r) => r.relation === "child")).toBe(true);
    expect(facts.locations.some((l) => /austin/i.test(l.label))).toBe(true);
  });
});

describe("buildSubjectDossier", () => {
  const base: Partial<OsintReport> = {
    id: "dossier-test",
    subject: { ...JOHN_DOE, email: "john@example.com", phone: "512-555-0100", city: "Austin", state: "TX" },
    createdAt: new Date().toISOString(),
    status: "complete",
    disambiguation: {
      score: 72,
      label: "Moderate",
      rationale: [],
      distinguishingSignals: [],
      homonymRisk: "medium",
      candidates: [],
      questions: [],
      refined: false,
    },
    executiveSummary: "",
    searchHits: [
      {
        title: "John Doe profile",
        url: `https://${ANCHOR_DOMAIN}`,
        snippet: "Married to Jane Smith. Works at Example Corp in Austin.",
        source: "test",
        query: "q",
        classification: "corroborated",
      },
    ],
    socialCandidates: [],
    evidence: [],
    sourceInventory: [],
    markdown: "",
    html: "",
    usernameProbes: [
      {
        platform: "github",
        username: "johndoe-dev",
        url: "https://github.com/johndoe-dev",
        exists: true,
        displayName: "John Doe",
        bio: "Developer at Example Corp",
        location: "Austin, TX",
        confidence: 90,
        method: "api",
      },
    ],
    scoredAccounts: [
      {
        platform: "github",
        username: "johndoe-dev",
        url: "https://github.com/johndoe-dev",
        posterior: 0.88,
        tier: "attributed",
        evidence: [],
        linkOwnership: "self-claimed",
      },
    ],
    investigatorBrief: {
      assessment: "Anchor-backed GitHub with corroborated site.",
      confidenceTier: "likely",
      verificationWarnings: [],
      anchorStatus: { hasUsername: true, hasEmail: true, hasDomain: true, sufficientForCommonName: true },
      accountToNameLinks: [],
      excludedIdentities: [],
      corroboratedFacts: [],
      recommendedActions: [],
      legalContacts: [],
      legalDisclaimer: "Public sources only.",
    },
  };

  it("builds narrative dossier with contacts and employment", () => {
    const d = buildSubjectDossier(base as OsintReport);
    expect(d.narrativeSummary).toMatch(/John Doe/i);
    expect(d.contacts.some((c) => c.type === "email")).toBe(true);
    expect(d.contacts.some((c) => c.type === "phone")).toBe(true);
    expect(d.employment.some((e) => /example/i.test(e.organization))).toBe(true);
    expect(d.socialProfiles.some((s) => s.platform === "github")).toBe(true);
    expect(d.gaps.length).toBeGreaterThan(0);
  });

  it("lists spouse from public text when present", () => {
    const d = buildSubjectDossier(base as OsintReport);
    expect(d.relatives.some((r) => r.relation === "spouse")).toBe(true);
  });
});