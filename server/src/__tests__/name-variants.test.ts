import { describe, expect, it } from "vitest";
import { nameMatchesInText } from "../modules/name-variants.js";

describe("nameMatchesInText", () => {
  it("rejects concatenated usernames that embed last name as substring", () => {
    expect(nameMatchesInText("Dustin", "Daprizio", "dustindaprizio · GitHub")).toBe(0);
  });

  it("accepts proper full-name forms", () => {
    expect(nameMatchesInText("Dustin", "Daprizio", "Dustin Daprizio - Business Owner | LinkedIn")).toBeGreaterThan(0.9);
  });
});