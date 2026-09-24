import { SpectraEngine } from "./engine.js";
import { VALIDATION_FIXTURES } from "./validation/fixtures.js";

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name: string, detail?: string) {
  failed++;
  console.log(`  ✗ ${name}${detail ? ` - ${detail}` : ""}`);
}

console.log("=== Spectra Desk Smoke Tests ===\n");

try {
  const engine = new SpectraEngine();
  ok("SpectraEngine instantiates");
  if (typeof engine.runInvestigation !== "function") fail("runInvestigation missing");
  else ok("runInvestigation available");
} catch (err) {
  fail("SpectraEngine instantiates", String(err));
}

if (VALIDATION_FIXTURES.length >= 3) ok(`validation fixtures loaded (${VALIDATION_FIXTURES.length})`);
else fail("validation fixtures", `expected >= 3, got ${VALIDATION_FIXTURES.length}`);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);