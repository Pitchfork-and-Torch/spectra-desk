import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scoreMultiSignal } from "../modules/multi-signal-scorer.js";
import { QUERY_CAPS, buildSearchQueries } from "../modules/query-multiply.js";
import { redactPreset } from "../modules/redactor.js";
import { applyHumanLock, attachCorroborate, merkleRoot } from "../v9/corroborate.js";
import { buildDemoReport, seedDemo } from "../v9/cases.js";
import { describeQueryPlan } from "../v9/query-plan.js";
import type { OsintReport } from "../types.js";

describe("v9 corroborate", () => {
  it("does not auto-LOCK a high fusion without an operator", () => {
    const lock = scoreMultiSignal({
      subject: { firstName: "Avery", lastName: "Quill", employer: "Example Archive", email: "a@example.invalid" },
      hits: [
        {
          title: "Avery Quill archive notice",
          url: "https://example.invalid/quill",
          snippet: "Avery Quill, Example Archive, Nowhere",
          source: "test",
          query: "q",
          classification: "corroborated",
        },
      ],
      excludedCount: 0,
      probes: [],
      businessFusionScore: 90,
      businessStrength: "attributed",
      officialRecordCount: 2,
      continuityScore: 80,
      attributedAccountCount: 2,
      semanticContentBoost: 12,
    });
    expect(lock.status).not.toBe("locked");
    expect(lock.lockedBy).not.toBe("auto");
  });

  it("LOCKs only when the operator confirms", () => {
    const lock = scoreMultiSignal({
      subject: { firstName: "Avery", lastName: "Quill", employer: "Example Archive" },
      hits: [],
      excludedCount: 0,
      probes: [],
      operatorConfirmed: true,
      businessFusionScore: 80,
      businessStrength: "likely",
    });
    expect(lock.status).toBe("locked");
    expect(lock.lockedBy).toBe("operator");
  });

  it("builds a matrix, a hashed ledger, and a seal only after human LOCK", () => {
    const report = buildDemoReport();
    expect(report.demo).toBe(true);
    expect(report.subject.lastName).toBe("Quill");
    expect(report.claimLedger?.rows[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.merkleSeal?.pendingHumanLock).toBe(true);
    expect(report.corroboration?.rows.some((row) => row.role === "homonym")).toBe(true);
    applyHumanLock(report, "2026-09-24T00:00:00.000Z");
    expect(report.identityLock?.lockedBy).toBe("operator");
    expect(report.merkleSeal?.root).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps Fast at or under 12 and counsel-safe redaction strips fixture PII", () => {
    const queries = buildSearchQueries(
      { firstName: "Avery", lastName: "Quill", email: "a@example.invalid", username: "averyquill-demo", employer: "Example Archive" },
      "fast",
    );
    expect(queries.length).toBeLessThanOrEqual(QUERY_CAPS.fast);
    const plan = describeQueryPlan({
      mode: "fast",
      firstName: "Avery",
      lastName: "Quill",
      email: "a@example.invalid",
      username: "averyquill-demo",
      employer: "Example Archive",
    });
    expect(plan.count).toBeLessThanOrEqual(12);
    const counsel = redactPreset("Reach ada@example.com or 415-555-0130. SSN 123-45-6789.", "counsel");
    expect(counsel.redacted).not.toContain("ada@example.com");
    expect(counsel.redacted).not.toContain("123-45-6789");
    expect(counsel.redacted).not.toContain("415-555-0130");
  });

  it("seeds a DEMO case with a PDF and a stable merkle helper", () => {
    const home = mkdtempSync(path.join(tmpdir(), "spectra-v9-"));
    const seeded = seedDemo(home);
    expect(seeded.id).toBe("spectra-demo-quill");
    expect(seeded.pdfPath.endsWith("REPORT.pdf")).toBe(true);
    expect(merkleRoot(["b", "a"])).toBe(merkleRoot(["a", "b"]));
  });

  it("refuses a merge when anchors conflict", () => {
    const report = buildDemoReport();
    report.identityLock = {
      ...(report.identityLock as NonNullable<OsintReport["identityLock"]>),
      contradictions: ["employer conflict"],
    };
    report.businessEntities = [
      {
        id: "a",
        legalName: "Example Archive",
        strength: "likely",
        confidence: "likely",
        locations: [],
        signals: [],
        sourceUrls: [],
        personLinkRationale: [],
      },
      {
        id: "b",
        legalName: "Other Life",
        strength: "likely",
        confidence: "likely",
        locations: [],
        signals: [],
        sourceUrls: [],
        personLinkRationale: [],
      },
    ];
    const matrix = attachCorroborate(report).corroboration;
    expect(matrix?.mergeRefused).toBe(true);
  });
});
