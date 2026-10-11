import { describe, expect, it } from "vitest";
import { isSafeCaseId } from "../lib/case-id.js";
import { isLocalAppOrigin } from "../lib/local-origin.js";

describe("case id", () => {
  it("allows the report id alphabet only", () => {
    expect(isSafeCaseId("spectra-ab12cd34")).toBe(true);
    expect(isSafeCaseId("Case_1")).toBe(true);
    expect(isSafeCaseId("../secrets")).toBe(false);
    expect(isSafeCaseId("a/b")).toBe(false);
    expect(isSafeCaseId("a b")).toBe(false);
    expect(isSafeCaseId("")).toBe(false);
    expect(isSafeCaseId("..")).toBe(false);
  });
});

describe("local origin", () => {
  it("allows electron and vite origins and rejects the rest", () => {
    expect(isLocalAppOrigin("http://127.0.0.1:3847")).toBe(true);
    expect(isLocalAppOrigin("http://127.0.0.1:3878")).toBe(true);
    expect(isLocalAppOrigin("http://127.0.0.1:3879")).toBe(false);
    expect(isLocalAppOrigin("http://localhost:5173")).toBe(true);
    expect(isLocalAppOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isLocalAppOrigin("http://localhost:3847")).toBe(true);
    expect(isLocalAppOrigin("https://evil.example")).toBe(false);
    expect(isLocalAppOrigin("http://192.168.1.5:3847")).toBe(false);
    expect(isLocalAppOrigin("null")).toBe(false);
  });
});
