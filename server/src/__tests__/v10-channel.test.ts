import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { demoPdf, gateSubscriber, grantSubscriber, isMinorLookup } from "../v10/channel.js";

const home = mkdtempSync(path.join(tmpdir(), "spectra-channel-"));
process.env.SPECTRA_DESK_HOME = home;
process.env.SPECTRA_CHANNEL_DIR = path.join(home, "channel");
process.env.SPECTRA_CHANNEL_DAILY_CAP = "2";

describe("v10 channel", () => {
  afterEach(() => {
    process.env.SPECTRA_CHANNEL_DAILY_CAP = "2";
  });

  it("refuses a minor lookup and an unpaid id", () => {
    expect(isMinorLookup("Jane Doe age 12 years old")).toBe(true);
    expect(isMinorLookup("Jane Doe")).toBe(false);
    expect(gateSubscriber(42, "Jane Doe").ok).toBe(false);
  });

  it("grants a paid month and still will not LOCK", () => {
    const row = grantSubscriber(42, 30, "test");
    expect(row.paidThrough >= new Date().toISOString().slice(0, 10)).toBe(true);
    expect(gateSubscriber(42, "Jane Doe").ok).toBe(true);
    const demo = demoPdf();
    expect(demo.locked).toBe(false);
    expect(demo.pdfPath.endsWith(".pdf")).toBe(true);
  });

  it("refuses a lapsed grant", () => {
    grantSubscriber(7, -2, "lapsed");
    expect(gateSubscriber(7, "Jane Doe").ok).toBe(false);
  });
});
