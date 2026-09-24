/**
 * Face / portrait clustering via dHash (v6)
 * Groups similar images; flags multi-person clusters.
 * Works on quality-filtered portraits only.
 */
import type { PortraitCandidate } from "../types.js";
import { hashSimilarity, verdictFromSimilarity } from "./image-phash.js";
import { assessPortraitUrlQuality } from "./portrait-quality.js";

export interface FaceCluster {
  id: string;
  memberIds: string[];
  representativeId: string;
  avgSimilarity: number;
  size: number;
  label: string;
  distinctFromAnchor: boolean;
}

export interface FaceClusterResult {
  clusters: FaceCluster[];
  unclustered: string[];
  multiPerson: boolean;
  summary: string;
}

function similarityFromHashes(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined;
  try {
    return hashSimilarity(a, b);
  } catch {
    return undefined;
  }
}

/** Cluster portraits by dHash similarity. */
export function clusterPortraits(
  candidates: PortraitCandidate[],
  opts?: { threshold?: number; anchorHash?: string },
): FaceClusterResult {
  const threshold = opts?.threshold ?? 0.78;
  const usable = candidates.filter((c) => {
    const q = assessPortraitUrlQuality(c.imageUrl, {
      label: c.label,
      platform: c.platform,
      profileUrl: c.profileUrl,
    });
    return q.isLikelyFace && !q.isPlatformLogo && c.dHash;
  });

  const assigned = new Set<string>();
  const clusters: FaceCluster[] = [];

  for (const seed of usable) {
    if (assigned.has(seed.id)) continue;
    const members: PortraitCandidate[] = [seed];
    assigned.add(seed.id);
    for (const other of usable) {
      if (assigned.has(other.id)) continue;
      const sim = similarityFromHashes(seed.dHash, other.dHash);
      if (sim != null && sim >= threshold) {
        members.push(other);
        assigned.add(other.id);
      }
    }
    const sims: number[] = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const s = similarityFromHashes(members[i]!.dHash, members[j]!.dHash);
        if (s != null) sims.push(s);
      }
    }
    const avg = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 1;
    let distinctFromAnchor = false;
    if (opts?.anchorHash && seed.dHash) {
      const simA = similarityFromHashes(opts.anchorHash, seed.dHash);
      const verdict = simA != null ? verdictFromSimilarity(simA, true) : "unknown";
      distinctFromAnchor = verdict === "distinct-person";
    }
    clusters.push({
      id: `face-cluster-${clusters.length + 1}`,
      memberIds: members.map((m) => m.id),
      representativeId: members[0]!.id,
      avgSimilarity: Math.round(avg * 1000) / 1000,
      size: members.length,
      label: members[0]!.label || members[0]!.platform,
      distinctFromAnchor,
    });
  }

  const unclustered = candidates.filter((c) => !assigned.has(c.id)).map((c) => c.id);
  const multiPerson = clusters.filter((c) => !c.distinctFromAnchor).length > 1 || clusters.some((c) => c.distinctFromAnchor);

  let summary: string;
  if (usable.length === 0) {
    summary = "No face-quality portraits available for clustering (logos/non-face assets excluded).";
  } else if (clusters.length === 1) {
    summary = `Single visual cluster (${clusters[0]!.size} image(s)) - consistent with one identity.`;
  } else {
    summary = `${clusters.length} visual clusters from ${usable.length} face-quality image(s) - review for multi-person collision.`;
  }

  return { clusters, unclustered, multiPerson, summary };
}
