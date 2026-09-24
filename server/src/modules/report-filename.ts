import type { SubjectInput } from "../types.js";

/** Sanitize for filesystem: LastName_FirstName_2026-07-03_ab130f6f */
export function buildReportFilename(
  subject: SubjectInput,
  reportId: string,
  completedAt?: string,
): string {
  const last = sanitizeToken(subject.lastName || "Unknown");
  const first = sanitizeToken(subject.firstName || "Subject");
  const date = formatReportDate(completedAt || new Date().toISOString());
  const shortId = reportId.replace(/^spectra-/, "").slice(0, 8);
  return `${last}_${first}_${date}_${shortId}.html`;
}

export function buildReportBasename(subject: SubjectInput, completedAt?: string): string {
  const last = sanitizeToken(subject.lastName || "Unknown");
  const first = sanitizeToken(subject.firstName || "Subject");
  const date = formatReportDate(completedAt || new Date().toISOString());
  return `${last}_${first}_${date}`;
}

function sanitizeToken(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 32) || "Unknown";
}

function formatReportDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}