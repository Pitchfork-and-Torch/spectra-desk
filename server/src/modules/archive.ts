import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../hash.js";
import type { EvidenceItem, SubjectInput } from "../types.js";
import { buildReportFilename } from "./report-filename.js";

export class ArchiveStore {
  constructor(private readonly root: string) {
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
  }

  caseDir(reportId: string) {
    const dir = path.join(this.root, reportId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  saveEvidence(
    reportId: string,
    item: Omit<EvidenceItem, "id" | "hash" | "capturedAt" | "archivePath">,
  ): EvidenceItem {
    const dir = this.caseDir(reportId);
    const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const capturedAt = new Date().toISOString();
    const hash = sha256(`${item.url}|${item.title}|${item.excerpt}`);
    const archivePath = path.join(dir, `${id}.json`);
    const record: EvidenceItem = { ...item, id, hash, capturedAt, archivePath };
    writeFileSync(archivePath, JSON.stringify(record, null, 2), "utf8");
    return record;
  }

  saveReport(reportId: string, markdown: string, html: string, subject?: SubjectInput, completedAt?: string) {
    const dir = this.caseDir(reportId);
    writeFileSync(path.join(dir, "REPORT.md"), markdown, "utf8");
    writeFileSync(path.join(dir, "REPORT.html"), html, "utf8");

    if (subject) {
      const named = buildReportFilename(subject, reportId, completedAt);
      const namedPath = path.join(dir, named);
      writeFileSync(namedPath, html, "utf8");

      const publishedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../reports/published");
      if (!existsSync(publishedDir)) mkdirSync(publishedDir, { recursive: true });
      copyFileSync(namedPath, path.join(publishedDir, named));
      return named;
    }
    return "REPORT.html";
  }

  saveManifest(reportId: string, manifest: unknown) {
    const dir = this.caseDir(reportId);
    writeFileSync(path.join(dir, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf8");
  }

  portraitsDir(reportId: string) {
    const dir = path.join(this.caseDir(reportId), "portraits");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  savePortrait(
    reportId: string,
    portraitId: string,
    buffer: Buffer,
    meta: { platform: string; label: string; imageUrl: string; role: string },
  ): { archivePath: string; hash: string } {
    const dir = this.portraitsDir(reportId);
    const safe = portraitId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
    const archivePath = path.join(dir, `${safe}.bin`);
    writeFileSync(archivePath, buffer);
    const metaPath = path.join(dir, `${safe}.json`);
    const hash = sha256(buffer.toString("base64"));
    writeFileSync(
      metaPath,
      JSON.stringify({ ...meta, portraitId, hash, savedAt: new Date().toISOString(), bytes: buffer.length }, null, 2),
      "utf8",
    );
    return { archivePath, hash };
  }
}