import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { demoPdf, gateSubscriber, grantSubscriber, isMinorLookup, privateRoomCommand, writeAudit } from "../v10/channel.js";

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
    expect(isMinorLookup("12-year-old Jane")).toBe(true);
    expect(isMinorLookup("Jane 17yo")).toBe(true);
    expect(isMinorLookup("age 7")).toBe(true);
    expect(isMinorLookup("Jane Doe 25 years old")).toBe(false);
    expect(isMinorLookup("Jane Doe")).toBe(false);
    expect(gateSubscriber(42, "Jane Doe").ok).toBe(false);
    expect(privateRoomCommand("demo")).toBe(true);
    expect(privateRoomCommand("grant")).toBe(true);
    expect(privateRoomCommand("whoami")).toBe(false);
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

  it("refuses a paid minor lookup", () => {
    grantSubscriber(11, 30, "paid");
    const gate = gateSubscriber(11, "12-year-old Jane");
    expect(gate.ok).toBe(false);
    expect(gate.reason || "").toMatch(/minors/);
  });

  it("counts dossier audits against the cap and ignores demo", () => {
    grantSubscriber(9, 30, "cap");
    const day = new Date().toISOString().slice(0, 10);
    writeAudit({ kind: "demo", telegramId: 9, day });
    expect(gateSubscriber(9, "Jane Doe").ok).toBe(true);
    writeAudit({ kind: "dossier", telegramId: 9, day });
    writeAudit({ kind: "dossier", telegramId: 9, day });
    const blocked = gateSubscriber(9, "Jane Doe");
    expect(blocked.ok).toBe(false);
    expect(blocked.reason || "").toMatch(/Daily cap/);
  });
});
