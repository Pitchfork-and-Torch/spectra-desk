import type { PortraitCandidate, PortraitCluster, PortraitDisambiguation, PortraitIntel } from "../types.js";
import { verdictFromSimilarity } from "./image-phash.js";

const CLUSTER_THRESHOLD = 0.72;

function clusterLabel(members: PortraitCandidate[], kind: PortraitCluster["kind"]): string {
  if (kind === "subject") return "Likely subject";
  if (kind === "homonym") return "Different person(s)";
  return "Unassigned faces";
}

export function buildPortraitClusters(candidates: PortraitCandidate[]): PortraitCluster[] {
  const assigned = candidates.filter((c) => c.userAssignment && c.userAssignment !== "pending");
  const pending = candidates.filter((c) => !c.userAssignment || c.userAssignment === "pending");

  const clusters: PortraitCluster[] = [];

  const subjectMembers = assigned.filter((c) => c.userAssignment === "subject" || c.role === "anchor");
  if (subjectMembers.length) {
    clusters.push({
      id: "cluster-subject",
      label: clusterLabel(subjectMembers, "subject"),
      kind: "subject",
      memberIds: subjectMembers.map((c) => c.id),
      anchorPortraitId: subjectMembers.find((c) => c.role === "anchor")?.id || subjectMembers[0]?.id,
    });
  }

  const homonymMembers = assigned.filter((c) => c.userAssignment === "homonym" || c.userAssignment === "reject");
  if (homonymMembers.length) {
    clusters.push({
      id: "cluster-homonym",
      label: clusterLabel(homonymMembers, "homonym"),
      kind: "homonym",
      memberIds: homonymMembers.map((c) => c.id),
    });
  }

  if (pending.length) {
    const anchor = candidates.find((c) => c.role === "anchor" && c.dHash);
    const autoHomonym: string[] = [];
    const autoSubject: string[] = [];

    for (const c of pending) {
      if (!anchor?.dHash || c.similarityToAnchor == null) continue;
      const v = verdictFromSimilarity(c.similarityToAnchor, true);
      if (v === "distinct-person") autoHomonym.push(c.id);
      else if (v === "matches-anchor" || v === "likely-same") autoSubject.push(c.id);
    }

    const stillPending = pending.filter(
      (c) => !autoHomonym.includes(c.id) && !autoSubject.includes(c.id),
    );

    if (autoSubject.length) {
      clusters.push({
        id: "cluster-auto-subject",
        label: "Visually similar to anchor",
        kind: "subject",
        memberIds: autoSubject,
        anchorPortraitId: anchor?.id,
      });
    }
    if (autoHomonym.length) {
      clusters.push({
        id: "cluster-auto-homonym",
        label: "Visually distinct from anchor",
        kind: "homonym",
        memberIds: autoHomonym,
      });
    }
    if (stillPending.length) {
      clusters.push({
        id: "cluster-pending",
        label: clusterLabel(stillPending, "unknown"),
        kind: "unknown",
        memberIds: stillPending.map((c) => c.id),
      });
    }
  }

  return clusters;
}

export function buildPortraitDisambiguation(intel: PortraitIntel | undefined): PortraitDisambiguation | undefined {
  if (!intel?.candidates.length) return undefined;
  const pendingCount = intel.candidates.filter(
    (c) => !c.userAssignment || c.userAssignment === "pending",
  ).length;
  return {
    clusters: buildPortraitClusters(intel.candidates),
    pendingCount,
    userRefined: intel.candidates.some((c) => c.userAssignment && c.userAssignment !== "pending"),
  };
}

export function applyPortraitUserAssignments(
  intel: PortraitIntel,
  assignments: Array<{ portraitId: string; assignment: "subject" | "homonym" | "reject" }>,
): PortraitIntel {
  const map = new Map(assignments.map((a) => [a.portraitId, a.assignment]));
  const candidates = intel.candidates.map((c) => {
    const assignment = map.get(c.id);
    if (!assignment) return c;
    const matchVerdict =
      assignment === "subject"
        ? "matches-anchor"
        : assignment === "homonym"
          ? "distinct-person"
          : c.matchVerdict;
    const role =
      assignment === "subject" ? "subject-account" : assignment === "homonym" ? "homonym" : c.role;
    return { ...c, userAssignment: assignment, matchVerdict, role };
  });

  let anchorPortrait = intel.anchorPortrait;
  const newAnchor = candidates.find((c) => c.userAssignment === "subject" && c.dHash);
  if (newAnchor) anchorPortrait = { ...newAnchor, role: "anchor", matchVerdict: "matches-anchor" };

  const homonymProfiles = candidates
    .filter((c) => c.userAssignment === "homonym" || c.userAssignment === "reject")
    .map((c) => ({
      label: c.label,
      portrait: c,
      distinctFromAnchor: true,
      similarity: c.similarityToAnchor,
    }));

  const assigned = assignments.length;
  const summary =
    assigned > 0
      ? `User refined ${assigned} portrait assignment(s). ${homonymProfiles.length} profile(s) marked as different people.`
      : intel.summary;

  return {
    ...intel,
    anchorPortrait,
    candidates,
    homonymProfiles,
    summary,
  };
}