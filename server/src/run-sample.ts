import { SpectraEngine } from "./engine.js";

const engine = new SpectraEngine();

const report = await engine.runInvestigation(
  {
    firstName: "John",
    lastName: "Doe",
    username: "johndoe",
    employer: "example.com",
    email: "john.doe@example.com",
    notes: "Sample run - replace with your investigation subject",
  },
  (p) => console.log(`[${p.percent}%] ${p.message}`),
);

console.log("\n=== SPECTRA SAMPLE REPORT ===");
console.log("ID:", report.id);
console.log("Score:", report.disambiguation.score, report.disambiguation.label);
console.log("Homonym:", report.disambiguation.homonymRisk);
console.log("Tier:", report.investigatorBrief?.confidenceTier);
console.log("Corroborated:", report.searchHits.filter((h) => h.classification === "corroborated").length);
console.log("Excluded:", report.excludedHits?.length);
console.log("Probes:", report.usernameProbes?.filter((p) => p.exists).map((p) => `${p.platform}@${p.username}`).join(", "));
console.log("\nHTML:", `${process.env.USERPROFILE || process.env.HOME}\\.spectra-desk\\cases\\${report.id}\\REPORT.html`);