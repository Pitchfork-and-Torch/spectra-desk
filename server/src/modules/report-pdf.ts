import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { launchChromium } from "../lib/playwright-launch.js";
import { SPECTRA_VERSION } from "../version.js";

/**
 * Render client HTML to a clean Letter PDF.
 * Forces print media, light background, and professional header/footer.
 */
export async function htmlToPdf(html: string, outputPath: string): Promise<void> {
  const browser = await launchChromium({
    args: ["--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    // Prefer print CSS and avoid dark-mode media queries
    await page.emulateMedia({ media: "print", colorScheme: "light" });
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    // Give layout a tick (no external fonts - system stack only)
    await page.evaluate(() => new Promise((r) => setTimeout(r, 80)));

    await page.pdf({
      path: outputPath,
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0.55in", bottom: "0.55in", left: "0.55in", right: "0.55in" },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:7.5px;width:100%;text-align:center;color:#64748b;font-family:Segoe UI,Arial,sans-serif;padding:0 24px">Spectra Desk - investigative lead, not legal proof</div>`,
      footerTemplate: `<div style="font-size:7.5px;width:100%;text-align:center;color:#64748b;font-family:Segoe UI,Arial,sans-serif;padding:0 24px"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
  } finally {
    await browser.close();
  }
}

export async function generateReportPdfFromCase(
  caseDir: string,
  reportId: string,
  exportFilename?: string,
): Promise<string | null> {
  const htmlPath =
    exportFilename && existsSync(path.join(caseDir, exportFilename))
      ? path.join(caseDir, exportFilename)
      : path.join(caseDir, "REPORT.html");
  if (!existsSync(htmlPath)) return null;

  const html = readFileSync(htmlPath, "utf8");
  const pdfName = (exportFilename || "REPORT.html").replace(/\.html$/i, ".pdf");
  const pdfPath = path.join(caseDir, pdfName);
  await htmlToPdf(html, pdfPath);
  return pdfName;
}
