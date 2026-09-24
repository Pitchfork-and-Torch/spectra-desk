import { createHash } from "node:crypto";
import type { ChainOfCustody, EvidenceItem } from "../types.js";
import { spectraToolLabel } from "../version.js";

export function buildChainOfCustody(reportId: string, createdAt: string, evidence: EvidenceItem[]): ChainOfCustody {
  const sorted = [...evidence].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const hashConcat = sorted.map((e) => e.hash).join("");
  const manifestHash = createHash("sha256").update(hashConcat).digest("hex");

  return {
    reportId,
    generatedAt: new Date().toISOString(),
    investigationStarted: createdAt,
    tool: spectraToolLabel(),
    evidenceCount: sorted.length,
    manifestHash,
    algorithm: "SHA-256 per item; manifest = SHA-256(concat item hashes)",
    items: sorted.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      url: e.url,
      hash: e.hash,
      capturedAt: e.capturedAt,
      archivePath: e.archivePath,
    })),
  };
}