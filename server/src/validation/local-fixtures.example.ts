import type { ValidationFixture } from "../types.js";

/** Copy to local-fixtures.ts for machine-specific ground-truth validation. */
export const LOCAL_VALIDATION_FIXTURES: ValidationFixture[] = [
  {
    name: "Example local subject",
    subject: { firstName: "Jane", lastName: "Doe", city: "Austin", state: "TX" },
    groundTruth: {
      field: "city",
      expected: "Austin",
      mustAppearInHits: false,
      minDisambiguationScore: 45,
    },
  },
];