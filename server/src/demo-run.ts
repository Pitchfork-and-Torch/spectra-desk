import { SpectraEngine } from "./engine.js";

const engine = new SpectraEngine();

console.log("═══ Spectra Desk Demo Investigation ═══\n");

const report = await engine.runInvestigation(
  {
    firstName: "Tim",
    lastName: "Cook",
    employer: "Apple",
    country: "United States",
  },
  (p) => process.stdout.write(`\r[${p.percent}%] ${p.message}`.padEnd(70)),
);

console.log("\n\n── Executive Summary ──");
console.log(report.executiveSummary.replace(/\*\*/g, ""));

console.log("\n── Disambiguation ──");
console.log(`${report.disambiguation.score}/100 - ${report.disambiguation.label}`);

console.log("\n── Top Search Hits ──");
for (const h of report.searchHits.slice(0, 5)) {
  console.log(`  • ${h.title}`);
  console.log(`    ${h.url}`);
}

console.log("\n── Social Candidates ──");
for (const s of report.socialCandidates.slice(0, 5)) {
  console.log(`  • ${s.platform} (${s.status}, ${s.confidence}%) ${s.url}`);
}

console.log(`\n── Evidence archived: ${report.evidence.length} items`);
console.log(`── Report ID: ${report.id}`);
console.log("\n✓ Demo complete.");