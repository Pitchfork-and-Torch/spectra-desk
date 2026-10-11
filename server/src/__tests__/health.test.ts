import { describe, expect, it } from "vitest";
import { getHealthPayload, SPECTRA_HEALTH_FEATURES } from "../lib/health.js";
import { SPECTRA_VERSION } from "../version.js";

describe("health payload", () => {
  it("reports live version and does not advertise unimplemented grok-synthesis", () => {
    const h = getHealthPayload();
    expect(h.ok).toBe(true);
    expect(h.service).toBe("spectra-desk");
    expect(h.version).toBe(SPECTRA_VERSION);
    expect(h.features).toEqual([...SPECTRA_HEALTH_FEATURES]);
    expect(h.features).not.toContain("grok-synthesis");
    expect(h.toolkitCount).toBeGreaterThanOrEqual(800);
  });

  it("chromiumOk is a boolean and path is omitted when missing", () => {
    const h = getHealthPayload();
    expect(typeof h.chromiumOk).toBe("boolean");
    if (!h.chromiumOk) expect(h.chromiumPath).toBeNull();
  });
});
