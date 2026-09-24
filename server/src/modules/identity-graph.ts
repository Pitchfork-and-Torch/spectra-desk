import type { IdentityGraph, IdentityGraphEdge, IdentityGraphNode, OsintReport, UsernameProbe } from "../types.js";
import type { ScoredAccount } from "./account-scoring.js";
import { fullName } from "./subject.js";

export function buildIdentityGraph(
  report: OsintReport,
  probes: UsernameProbe[],
  scored?: ScoredAccount[],
): IdentityGraph {
  const scoredMap = new Map((scored || []).map((s) => [s.url, s]));
  const nodes: IdentityGraphNode[] = [];
  const edges: IdentityGraphEdge[] = [];
  const name = fullName(report.subject) || "Subject";

  const subjectId = "subject:primary";
  nodes.push({ id: subjectId, type: "person", label: name, confidence: report.disambiguation.score });

  for (const d of report.disambiguation.distinguishingSignals) {
    if (d.startsWith("Employer:") || d.includes(".")) {
      const domain = d.replace("Employer:", "").trim();
      const id = `domain:${domain}`;
      if (!nodes.find((n) => n.id === id)) {
        nodes.push({ id, type: "domain", label: domain, url: domain.startsWith("http") ? domain : `https://${domain}`, confidence: 80 });
        edges.push({ from: subjectId, to: id, relation: "associated-domain", confidence: 75, evidence: [] });
      }
    }
  }

  for (const probe of probes.filter((p) => p.exists)) {
    const sc = scoredMap.get(probe.url);
    if (sc?.tier === "quarantined") continue;
    const id = `account:${probe.platform}:${probe.username}`;
    const conf = sc ? Math.round(sc.posterior * 100) : probe.confidence;
    nodes.push({
      id,
      type: "account",
      label: `${probe.platform}/@${probe.username}${sc?.tier ? ` (${sc.tier})` : ""}`,
      url: probe.url,
      confidence: conf,
    });
    const relation =
      sc?.linkOwnership === "collaborator"
        ? "site-linked-associate"
        : sc?.tier === "attributed"
          ? "attributed-account"
          : "discovered-account";
    edges.push({
      from: subjectId,
      to: id,
      relation,
      confidence: sc?.linkOwnership === "collaborator" ? Math.min(conf, 42) : conf,
      evidence: [probe.url, sc?.ownershipNote || ""].filter(Boolean),
    });

    if (probe.displayName && probe.displayName.toLowerCase() !== name.toLowerCase()) {
      const nameId = `name:${probe.displayName}`;
      if (!nodes.find((n) => n.id === nameId)) {
        nodes.push({ id: nameId, type: "person", label: probe.displayName, confidence: probe.confidence - 10 });
      }
      edges.push({
        from: id,
        to: nameId,
        relation: "profile-display-name",
        confidence: probe.confidence - 5,
        evidence: [probe.url],
      });
    }

    if (probe.linkedUrl) {
      const linkId = `domain:${probe.linkedUrl}`;
      nodes.push({ id: linkId, type: "domain", label: probe.linkedUrl, url: probe.linkedUrl, confidence: 70 });
      edges.push({ from: id, to: linkId, relation: "profile-link", confidence: 75, evidence: [probe.url] });
    }
  }

  for (const hit of report.searchHits.filter((h) => h.classification === "corroborated").slice(0, 6)) {
    const id = `source:${hit.url}`;
    nodes.push({ id, type: "source", label: hit.title.slice(0, 80), url: hit.url, confidence: hit.relevanceScore || 50 });
    edges.push({
      from: subjectId,
      to: id,
      relation: "corroborated-search",
      confidence: hit.relevanceScore || 50,
      evidence: hit.anchorSignals || [],
    });
  }

  for (const ex of report.excludedHits?.slice(0, 4) || []) {
    const id = `excluded:${ex.url}`;
    nodes.push({ id, type: "person", label: ex.title.slice(0, 60), url: ex.url, confidence: 15 });
    edges.push({
      from: subjectId,
      to: id,
      relation: "excluded-homonym",
      confidence: 10,
      evidence: [ex.exclusionReason || "homonym"],
    });
  }

  return { nodes, edges };
}