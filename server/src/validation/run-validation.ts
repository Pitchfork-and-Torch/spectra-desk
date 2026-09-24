import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpectraEngine } from "../engine.js";
import { VALIDATION_FIXTURES } from "./fixtures.js";
import type { ValidationFixture } from "../types.js";

/** Validation uses HTTP search stack by default - avoids Playwright captcha timeouts. */
if (!process.env.SPECTRA_HTTP_SEARCH_ONLY) {
  process.env.SPECTRA_HTTP_SEARCH_ONLY = "1";
}
process.env.SPECTRA_VALIDATION = "1";

/**
 * Optional machine-local fixtures (gitignored). Loaded via path string so tsc does not
 * require the file to exist on CI.
 */
async function loadLocalFixtures(): Promise<ValidationFixture[]> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const localPath = path.join(dir, "local-fixtures.ts");
  const distPath = path.join(dir, "local-fixtures.js");
  const candidate = existsSync(distPath) ? distPath : existsSync(localPath) ? localPath : null;
  if (!candidate) return [];
  try {
    const mod = (await import(pathToFileURL(candidate).href)) as {
      LOCAL_VALIDATION_FIXTURES?: ValidationFixture[];
    };
    return mod.LOCAL_VALIDATION_FIXTURES ?? [];
  } catch {
    return [];
  }
}

const engine = new SpectraEngine();

console.log("═══ Spectra Desk Ground-Truth Validation ═══\n");

let passed = 0;
let failed = 0;

const allFixtures = [...VALIDATION_FIXTURES, ...(await loadLocalFixtures())];

for (const fixture of allFixtures) {
  process.stdout.write(`Testing: ${fixture.name}... `);
  await new Promise((r) => setTimeout(r, 500));
  try {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(fixture.subject)) {
      if (v) raw[k] = String(v);
    }

    const report = await engine.runInvestigation({ ...raw, mode: "validation" });

    const errors: string[] = [];
    const gt = fixture.groundTruth;
    const blob = [
      ...report.searchHits.map((h) => `${h.title} ${h.snippet} ${h.url}`),
      ...(report.wikipedia || []).map((w) => `${w.title} ${w.description} ${w.url}`),
      report.executiveSummary,
      ...report.disambiguation.rationale,
      ...report.evidence.map((e) => `${e.title} ${e.excerpt}`),
    ]
      .join(" ")
      .toLowerCase();

    const expected = gt.expected.toLowerCase();
    const flexibleMatch = blob.includes(expected) || expected.split(/\s+/).every((w) => blob.includes(w));

    if (gt.minDisambiguationScore && report.disambiguation.score < gt.minDisambiguationScore) {
      errors.push(`score ${report.disambiguation.score} < ${gt.minDisambiguationScore}`);
    }

    if (gt.field === "wikipediaTitle") {
      const wikiHit = report.wikipedia?.some((w) => w.title.toLowerCase().includes(expected));
      if (!wikiHit && !flexibleMatch) errors.push(`Wikipedia/title "${gt.expected}" not found`);
    } else if (gt.mustAppearInHits) {
      if (!flexibleMatch) errors.push(`ground truth "${gt.expected}" not in report corpus`);
    }

    if (gt.expectHomonymRisk === "high" && report.disambiguation.homonymRisk !== "high") {
      errors.push(`expected homonymRisk=high, got ${report.disambiguation.homonymRisk}`);
    }
    if (gt.expectHomonymRisk === "low" && report.disambiguation.homonymRisk === "high") {
      errors.push(`expected homonymRisk≠high, got high`);
    }

    if (gt.expectTopCandidateContains) {
      const top = report.disambiguation.candidates[0]?.sourceUrl || "";
      if (!top.toLowerCase().includes(gt.expectTopCandidateContains.toLowerCase())) {
        errors.push(`top candidate "${top}" missing "${gt.expectTopCandidateContains}"`);
      }
    }

    if (gt.mustExcludeFromSocial?.length) {
      const socialUrls = [
        ...report.socialCandidates.map((s) => s.url),
        ...(report.usernameProbes || []).filter((p) => p.exists).map((p) => p.url),
      ].join(" ").toLowerCase();
      for (const ex of gt.mustExcludeFromSocial) {
        if (socialUrls.includes(ex.toLowerCase())) {
          errors.push(`excluded URL still in social/probes: ${ex}`);
        }
      }
    }

    if (gt.expectLinkedInOverGitHub) {
      // Accept /in/ profiles or /pub/dir pivots (site:linkedin is frequently blocked by search engines)
      const liIdx = report.disambiguation.candidates.findIndex((c) =>
        /linkedin\.com\/(in|pub)\//i.test(c.sourceUrl),
      );
      const ghIdx = report.disambiguation.candidates.findIndex((c) => /github\.com\//i.test(c.sourceUrl));
      if (liIdx < 0) errors.push("no LinkedIn candidate in disambiguation");
      else if (ghIdx >= 0 && liIdx > ghIdx) errors.push(`GitHub ranked above LinkedIn (li=${liIdx} gh=${ghIdx})`);
    }

    if (errors.length) {
      failed++;
      console.log(`FAIL`);
      errors.forEach((e) => console.log(`    ✗ ${e}`));
      console.log(`    score=${report.disambiguation.score} hits=${report.searchHits.length} homonym=${report.disambiguation.homonymRisk}`);
    } else {
      passed++;
      console.log(`PASS (score=${report.disambiguation.score}, hits=${report.searchHits.length}, risk=${report.disambiguation.homonymRisk})`);
    }
  } catch (error) {
    failed++;
    console.log(`ERROR: ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`\n═══ ${passed} passed, ${failed} failed / ${allFixtures.length} fixtures ═══`);
process.exit(failed ? 1 : 0);