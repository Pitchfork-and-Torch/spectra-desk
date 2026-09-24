/**
 * v8 Dustin Daprizio regression fixture
 * Pass criteria from Master Build Spec §2 / §8:
 * - BIO Scene Care attributed strongly
 * - MMA synthesized into life arc (not top-level noise)
 * - Low-confidence probes relegated
 * - Client report omits quarantine walls
 * - Employment org names not garbled FAQ text
 * - Multi-signal scoring weights official records + business over probe counts
 */
import { describe, expect, it } from "vitest";
import { analyzeSemanticCorpus, scoreLifeContinuity } from "../modules/semantic-content.js";
import { resolveBusinessEntities } from "../modules/business-entity.js";
import { buildLifeTimeline } from "../modules/life-timeline.js";
import {
  applyAttributionGate,
  sanitizeOrganizationName,
  filterDossierSocialForClient,
} from "../modules/attribution-gate.js";
import { scoreMultiSignal } from "../modules/multi-signal-scorer.js";
import { buildPersonaClusters } from "../modules/persona-cluster.js";
import { buildClientReportMarkdown, buildClientExecutiveSummary } from "../modules/client-report.js";
import type { OsintReport, SearchHit, UsernameProbe } from "../types.js";

const DUSTIN = {
  firstName: "Dustin",
  lastName: "Daprizio",
  city: "Tampa",
  state: "FL",
};

const DUSTIN_HITS: SearchHit[] = [
  {
    title: "Dustin Daprizio - BIO Scene Care | VoyageTampa",
    url: "https://voyagetampa.com/interview/dustin-daprizio",
    snippet:
      "Dustin Daprizio owner of BIO Scene Care LLC Tampa biohazard crime scene cleanup Navy combat medic veteran",
    source: "web",
    query: "dustin daprizio tampa",
    classification: "corroborated",
  },
  {
    title: "BIO Scene Care LLC - Florida Sunbiz",
    url: "https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquirytype=EntityName&directionType=Initial&searchNameOrder=BIOSCENE&aggregateId=domp-xxx",
    snippet: "BIO SCENE CARE LLC Registered Agent Dustin L Daprizio 205 W Hyde Park Pl #101 Tampa FL",
    source: "web",
    query: "dustin daprizio sunbiz",
    classification: "corroborated",
  },
  {
    title: "BIO Scene Care | BBB Business Profile",
    url: "https://www.bbb.org/us/fl/tampa/profile/biohazard/bio-scene-care",
    snippet: "Principal: Dustin Daprizio. Biohazard cleanup Tampa Hillsborough",
    source: "web",
    query: "bio scene care bbb",
    classification: "corroborated",
  },
  {
    title: "About - BIO Scene Care",
    url: "https://bioscenecare.com/about",
    snippet: "Founded by Dustin Daprizio, Navy combat medic, veteran-owned biohazard and after-death cleanup",
    source: "web",
    query: "bioscenecare about",
    classification: "corroborated",
  },
  {
    title: "Dustin Daprizio MMA Fight History - ESPN",
    url: "https://www.espn.com/mma/fighter/_/id/3961979/dustin-daprizio",
    snippet: "Dustin Daprizio fight history Sherdog Omaha Nebraska MMA",
    source: "web",
    query: "dustin daprizio mma",
    classification: "corroborated",
  },
  {
    title: "Dustin Daprizio arrested Hillsborough County battery",
    url: "https://www.example-news.com/hillsborough/dustin-daprizio-arrest-2025",
    snippet: "Dustin Daprizio Tampa Hillsborough County arrest mugshot battery March 2025 road rage",
    source: "web",
    query: "dustin daprizio arrest",
    classification: "corroborated",
  },
  {
    title: "Dustin Daprizio | LinkedIn",
    url: "https://www.linkedin.com/in/dustindaprizio",
    snippet: "Dustin Daprizio Tampa FL University of Nebraska Omaha BIO Scene Care",
    source: "web",
    query: "dustin daprizio linkedin",
    classification: "corroborated",
  },
  {
    title: "Stacey Daprizio | LinkedIn",
    url: "https://www.linkedin.com/in/stacey-daprizio",
    snippet: "Stacey Daprizio professional profile",
    source: "web",
    query: "daprizio",
    classification: "possible",
  },
];

function makeProbes(n: number): UsernameProbe[] {
  return Array.from({ length: n }, (_, i) => ({
    platform: i % 2 === 0 ? "Instagram" : "TikTok",
    username: i % 3 === 0 ? "dustindaprizio" : i % 3 === 1 ? "dustin.daprizio" : "ddaprizio",
    url: `https://example.com/u/${i}`,
    exists: true,
    confidence: 9,
    method: "http-probe" as const,
  }));
}

describe("v8 Dustin Daprizio regression", () => {
  it("extracts multi-stage life arc and treats MMA as continuity not noise", () => {
    const semantic = analyzeSemanticCorpus(DUSTIN_HITS, DUSTIN);
    expect(semantic.lifeStages).toEqual(
      expect.arrayContaining(["biohazard-cleanup", "business-owner", "mma-combat-sports"]),
    );
    expect(semantic.continuityScore).toBeGreaterThanOrEqual(20);
    expect(semantic.narrativeHints.some((h) => /life arc|continuity|multi-decade/i.test(h))).toBe(true);
    expect(scoreLifeContinuity(semantic.lifeStages)).toBeGreaterThanOrEqual(20);

    const mma = semantic.hits.find((h) => /espn\.com\/mma/i.test(h.url));
    expect(mma?.category).toBe("mma-combat-sports");
    expect(mma?.promoteToMain).toBe(true);
  });

  it("demotes wrong-person LinkedIn candidates", () => {
    const semantic = analyzeSemanticCorpus(DUSTIN_HITS, DUSTIN);
    const stacey = semantic.hits.find((h) => /stacey/i.test(h.title));
    expect(stacey?.promoteToMain).toBe(false);
    expect(stacey?.demoteReason).toMatch(/collision|different person/i);
  });

  it("fuses BIO Scene Care with strong business attribution", () => {
    const biz = resolveBusinessEntities(DUSTIN, DUSTIN_HITS, {
      domainIntelDomain: "bioscenecare.com",
      siteTitle: "BIO Scene Care",
      siteDescription: "Dustin Daprizio owner biohazard cleanup Tampa",
    });
    expect(biz.primary?.legalName).toMatch(/bio\s*scene\s*care/i);
    expect(["attributed", "likely", "locked"]).toContain(biz.primary?.strength);
    expect(biz.fusionScore).toBeGreaterThanOrEqual(18);
    expect(biz.personIsOwnerLikely).toBe(true);
    expect(biz.employmentForDossier[0]?.organization).toMatch(/bio\s*scene/i);
    expect(biz.employmentForDossier[0]?.organization).not.toMatch(/how many employees/i);
  });

  it("builds life timeline with business + MMA + arrest stages", () => {
    const semantic = analyzeSemanticCorpus(DUSTIN_HITS, DUSTIN);
    const biz = resolveBusinessEntities(DUSTIN, DUSTIN_HITS);
    const tl = buildLifeTimeline(DUSTIN, semantic, biz.entities);
    expect(tl.events.length).toBeGreaterThanOrEqual(3);
    expect(tl.narrativeArc).toMatch(/Dustin|Tampa|BIO|biohazard|MMA|combat/i);
    expect(tl.personaStages.some((s) => /mma|business|biohazard|arrest/i.test(s.stage))).toBe(true);
    expect(tl.openQuestions.length).toBeGreaterThan(0);
  });

  it("relegates HTTP-only username probes from main report", () => {
    const probes = makeProbes(40);
    // One attributed with content
    probes.push({
      platform: "Hacker News",
      username: "ddaprizio",
      url: "https://news.ycombinator.com/user?id=ddaprizio",
      exists: true,
      confidence: 90,
      method: "api",
      displayName: "Dustin Daprizio",
      bio: "Tampa",
    });
    const gate = applyAttributionGate({
      probes,
      scored: [
        {
          platform: "Instagram",
          username: "dustindaprizio",
          url: probes[0]!.url,
          posterior: 0.09,
          tier: "quarantined",
          evidence: [],
        },
        {
          platform: "Hacker News",
          username: "ddaprizio",
          url: "https://news.ycombinator.com/user?id=ddaprizio",
          posterior: 0.72,
          tier: "attributed",
          evidence: [{ id: "api", label: "API", logOdds: 1.2 }],
          displayName: "Dustin Daprizio",
        },
      ],
      hits: DUSTIN_HITS,
      semanticHits: analyzeSemanticCorpus(DUSTIN_HITS, DUSTIN).hits,
    });

    expect(gate.stats.probesAppendix).toBeGreaterThanOrEqual(30);
    expect(gate.mainAccounts.every((a) => a.tier !== "QUARANTINED")).toBe(true);
    expect(gate.mainAccounts.some((a) => a.platform === "Hacker News")).toBe(true);
    expect(gate.mainSearchHits.some((h) => /bioscenecare|sunbiz|bbb|voyage/i.test(h.url + h.title))).toBe(
      true,
    );
    // Stacey should not dominate main hits
    expect(gate.mainSearchHits.every((h) => !/stacey/i.test(h.title))).toBe(true);
  });

  it("sanitizes garbled employment FAQ org names", () => {
    expect(sanitizeOrganizationName("BIO Scene Care is Dustin Daprizio. How many employees are there?")).toBeNull();
    expect(sanitizeOrganizationName("BIO Scene Care LLC")).toMatch(/BIO Scene Care/i);
  });

  it("filters dossier social to attributed/likely only", () => {
    const { main, appendix } = filterDossierSocialForClient([
      {
        platform: "Hacker News",
        username: "ddaprizio",
        url: "https://news.ycombinator.com/user?id=ddaprizio",
        tier: "attributed",
        posterior: 72,
        verificationNote: "api · attributed",
      },
      {
        platform: "Instagram",
        username: "dustindaprizio",
        url: "https://instagram.com/dustindaprizio",
        tier: "quarantined",
        posterior: 9,
        verificationNote: "http-probe · quarantined",
      },
    ]);
    expect(main).toHaveLength(1);
    expect(appendix).toHaveLength(1);
    expect(main[0]!.platform).toBe("Hacker News");
  });

  it("scores Dustin-class corpus high on business+records, ignores 40 probes", () => {
    const probes = makeProbes(40);
    const biz = resolveBusinessEntities(DUSTIN, DUSTIN_HITS, {
      domainIntelDomain: "bioscenecare.com",
      siteTitle: "BIO Scene Care",
      siteDescription: "Dustin Daprizio owner",
    });
    const semantic = analyzeSemanticCorpus(DUSTIN_HITS, DUSTIN);

    const lock = scoreMultiSignal({
      subject: DUSTIN,
      hits: DUSTIN_HITS,
      excludedCount: 3,
      probes,
      deepProfiles: [],
      portraits: [
        {
          id: "mug",
          label: "Hillsborough mugshot",
          platform: "Public record",
          profileUrl: DUSTIN_HITS[5]!.url,
          imageUrl: "https://example.com/mugshot.jpg",
          role: "corroborating",
          matchVerdict: "unknown",
        },
      ],
      hasLinkedInPivot: false,
      businessFusionScore: biz.fusionScore,
      businessStrength: biz.primary?.strength,
      continuityScore: semantic.continuityScore,
      attributedAccountCount: 0,
      semanticContentBoost: 12,
    });

    expect(lock.score).toBeGreaterThanOrEqual(62);
    expect(lock.status === "probable" || lock.status === "locked" || lock.status === "possible").toBe(true);
    // Must not be structural-only cap when business+records present
    expect(lock.scoreCapApplied).toBeUndefined();
    expect(lock.signalClasses).toEqual(expect.arrayContaining(["business-entity", "official-record"]));
    expect(lock.rationale.some((r) => /existence probes ignored|not counted as attribution/i.test(r))).toBe(
      true,
    );
  });

  it("persona clusters include life-arc-primary and do not elevate unverified", () => {
    const semantic = analyzeSemanticCorpus(DUSTIN_HITS, DUSTIN);
    const biz = resolveBusinessEntities(DUSTIN, DUSTIN_HITS);
    const clusters = buildPersonaClusters(
      [
        {
          platform: "Instagram",
          username: "x",
          url: "https://instagram.com/x",
          posterior: 0.09,
          tier: "quarantined",
          method: "http-probe",
          evidence: [],
        },
      ],
      undefined,
      { semantic, businesses: biz.entities },
    );
    const primary = clusters.find((c) => c.label === "life-arc-primary" || c.label === "business-owner");
    expect(primary).toBeTruthy();
    expect(primary!.confidence).toBeGreaterThanOrEqual(55);
    const unverified = clusters.find((c) => c.label === "unverified");
    expect(unverified?.confidence).toBeLessThan(30);
    const mma = clusters.find((c) => c.label === "mma-athlete");
    expect(mma).toBeTruthy();
    // With continuity, MMA should not be marked competing
    if (semantic.continuityScore >= 15) {
      expect(mma!.competing).toBe(false);
    }
  });

  it("client report markdown has no quarantine wall and includes BIO Scene Care", () => {
    const semantic = analyzeSemanticCorpus(DUSTIN_HITS, DUSTIN);
    const businesses = resolveBusinessEntities(DUSTIN, DUSTIN_HITS, {
      domainIntelDomain: "bioscenecare.com",
      siteTitle: "BIO Scene Care",
    });
    const timeline = buildLifeTimeline(DUSTIN, semantic, businesses.entities);
    const probes = makeProbes(35);
    const gate = applyAttributionGate({
      probes,
      scored: probes.map((p) => ({
        platform: p.platform,
        username: p.username,
        url: p.url,
        posterior: 0.09,
        tier: "quarantined" as const,
        evidence: [],
      })),
      hits: DUSTIN_HITS,
      semanticHits: semantic.hits,
    });
    const identityLock = scoreMultiSignal({
      subject: DUSTIN,
      hits: DUSTIN_HITS,
      excludedCount: 2,
      probes,
      businessFusionScore: businesses.fusionScore,
      businessStrength: businesses.primary?.strength,
      continuityScore: semantic.continuityScore,
      semanticContentBoost: 10,
    });

    const report = {
      id: "spectra-test-dustin",
      subject: DUSTIN,
      createdAt: new Date().toISOString(),
      status: "complete" as const,
      disambiguation: {
        score: identityLock.score,
        label: "test",
        rationale: [],
        distinguishingSignals: [],
        homonymRisk: "medium" as const,
        candidates: [],
        questions: [],
        refined: false,
      },
      executiveSummary: "",
      searchHits: DUSTIN_HITS,
      socialCandidates: [],
      evidence: [],
      sourceInventory: [],
      markdown: "",
      html: "",
      chainOfCustody: {
        reportId: "spectra-test-dustin",
        generatedAt: new Date().toISOString(),
        investigationStarted: new Date().toISOString(),
        tool: "Spectra Desk v8",
        evidenceCount: 10,
        manifestHash: "abc123",
        algorithm: "SHA-256",
        items: [],
      },
    } as OsintReport;

    const ctx = { gate, semantic, businesses, timeline, identityLock };
    const md = buildClientReportMarkdown(report, ctx);
    const exec = buildClientExecutiveSummary(report, ctx);

    expect(md).toMatch(/BIO Scene Care/i);
    expect(md).toMatch(/Executive Summary/i);
    expect(md).toMatch(/Life Timeline|timeline/i);
    expect(md).not.toMatch(/QUARANTINED 9%/);
    expect(md).not.toMatch(/@dustindaprizio.*quarantined/i);
    expect((md.match(/instagram/gi) || []).length).toBeLessThan(5);
    expect(exec).toMatch(/Dustin|Tampa/i);
    expect(gate.stats.probesAppendix).toBeGreaterThanOrEqual(30);
  });
});
