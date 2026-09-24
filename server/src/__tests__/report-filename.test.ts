import { describe, expect, it } from "vitest";
import { buildReportFilename } from "../modules/report-filename.js";

describe("report-filename", () => {
  it("formats Last_First_Date_id.html", () => {
    const name = buildReportFilename(
      { firstName: "John", lastName: "Doe" },
      "spectra-ab130f6f",
      "2026-07-03T12:00:00.000Z",
    );
    expect(name).toMatch(/^Doe_John_2026-07-03_ab130f6f\.html$/);
  });
});