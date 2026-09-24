import { describe, expect, it } from "vitest";
import {
  generateMonikers,
  buildMonikerDiscoveryDorks,
  extractMonikersFromText,
} from "../modules/moniker-engine.js";

const DUSTIN = { firstName: "Dustin", lastName: "Daprizio", city: "Tampa", state: "FL" };

describe("moniker-engine", () => {
  it("generates dotted, initial, and reverse forms", () => {
    const m = generateMonikers(DUSTIN);
    const handles = m.map((x) => x.handle);
    expect(handles).toContain("dustindaprizio");
    expect(handles).toContain("dustin.daprizio");
    expect(handles).toContain("ddaprizio");
    expect(handles.some((h) => h.includes("daprizio") && h.includes("dustin"))).toBe(true);
  });

  it("ranks intake username highest", () => {
    const m = generateMonikers({ ...DUSTIN, username: "fightnight_dd" });
    expect(m[0]?.handle).toBe("fightnight_dd");
    expect(m[0]?.confidence).toBeGreaterThan(0.9);
  });

  it("parses aka from notes", () => {
    const m = generateMonikers({ ...DUSTIN, notes: "aka dustin_dap" });
    expect(m.some((x) => x.handle === "dustin_dap" && x.kind === "aka")).toBe(true);
  });

  it("builds discovery dorks including name aka patterns", () => {
    const monikers = generateMonikers(DUSTIN, { max: 8 });
    const dorks = buildMonikerDiscoveryDorks(DUSTIN, monikers);
    expect(dorks.some((d) => d.includes("also known as") || d.includes("aka"))).toBe(true);
  });

  it("extracts @handles from free text", () => {
    const found = extractMonikersFromText("Contact @dustindaprizio on IG formerly dap_tampa", DUSTIN);
    expect(found.some((f) => f.handle === "dustindaprizio")).toBe(true);
  });
});
