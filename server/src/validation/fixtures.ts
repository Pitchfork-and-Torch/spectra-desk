import type { ValidationFixture } from "../types.js";

export const VALIDATION_FIXTURES: ValidationFixture[] = [
  {
    name: "Tim Cook + Apple (employer anchor)",
    subject: { firstName: "Tim", lastName: "Cook", employer: "Apple", country: "United States" },
    groundTruth: {
      field: "employer",
      expected: "Apple",
      mustAppearInHits: true,
      minDisambiguationScore: 75,
      expectHomonymRisk: "low",
    },
  },
  {
    name: "Barack Obama + US (notable public figure)",
    subject: { firstName: "Barack", lastName: "Obama", country: "United States" },
    groundTruth: {
      field: "wikipediaTitle",
      expected: "Barack Obama",
      mustAppearInHits: true,
      minDisambiguationScore: 70,
      expectHomonymRisk: "low",
    },
  },
  {
    name: "Elon Musk + Tesla (employer anchor)",
    subject: { firstName: "Elon", lastName: "Musk", employer: "Tesla" },
    groundTruth: {
      field: "employer",
      expected: "Tesla",
      mustAppearInHits: true,
      minDisambiguationScore: 65,
      expectHomonymRisk: "low",
    },
  },
  {
    name: "John Smith (common name - homonym test)",
    subject: { firstName: "John", lastName: "Smith", city: "Austin", state: "Texas" },
    groundTruth: {
      field: "city",
      expected: "Austin",
      mustAppearInHits: false,
      minDisambiguationScore: 45,
      expectHomonymRisk: "high",
    },
  },
  {
    name: "Satya Nadella + Microsoft",
    subject: { firstName: "Satya", lastName: "Nadella", employer: "Microsoft" },
    groundTruth: {
      field: "employer",
      expected: "Microsoft",
      mustAppearInHits: true,
      minDisambiguationScore: 65,
      expectHomonymRisk: "low",
    },
  },
];