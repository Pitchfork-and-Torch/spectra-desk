import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { OsintReport } from "./types.js";

const DATA_DIR = path.join(process.env.USERPROFILE || process.env.HOME || ".", ".spectra-desk");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

export class ReportStore {
  constructor() {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(INDEX_PATH)) writeFileSync(INDEX_PATH, "[]", "utf8");
  }

  private readIndex(): Array<{ id: string; status: string; createdAt: string; name: string }> {
    return JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  }

  private writeIndex(entries: Array<{ id: string; status: string; createdAt: string; name: string }>) {
    writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2), "utf8");
  }

  save(report: OsintReport) {
    const file = path.join(DATA_DIR, `${report.id}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2), "utf8");

    const index = this.readIndex().filter((e) => e.id !== report.id);
    const name = [report.subject.firstName, report.subject.lastName].filter(Boolean).join(" ") || "Unknown";
    index.unshift({ id: report.id, status: report.status, createdAt: report.createdAt, name });
    this.writeIndex(index.slice(0, 50));
  }

  get(id: string): OsintReport | null {
    const file = path.join(DATA_DIR, `${id}.json`);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8")) as OsintReport;
  }

  list() {
    return this.readIndex();
  }
}