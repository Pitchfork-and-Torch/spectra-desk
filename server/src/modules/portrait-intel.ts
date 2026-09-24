import type {
  GitHubIntel,
  EmailIntel,
  PortraitCandidate,
  PortraitIntel,
  ScoredAccountSummary,
  SubjectInput,
  UsernameProbe,
} from "../types.js";
import { ArchiveStore } from "./archive.js";
import {
  bufferToDataUri,
  computeDHash,
  fetchImageBuffer,
  hashSimilarity,
  verdictFromSimilarity,
} from "./image-phash.js";
import {
  collectPortraitSourceUrls,
  enrichSourcesFromSearchHits,
  enrichSourcesWithXOgImage,
  type PortraitSource,
} from "./portrait-collector.js";
import { buildPortraitDisambiguation } from "./portrait-disambiguation.js";
import type { SearchHit } from "../types.js";
import { applyPortraitMemory, lookupSubjectHistory } from "./subject-history.js";
import type { SiteFingerprint } from "./website-profiler.js";

export interface PortraitBuildOpts {
  siteFp?: SiteFingerprint;
  githubIntel?: GitHubIntel;
  emailIntel?: EmailIntel;
  usernameProbes?: UsernameProbe[];
  scoredAccounts?: ScoredAccountSummary[];
  domainUrl?: string;
  fastMode?: boolean;
  searchHits?: SearchHit[];
  referencePhotoBuffer?: Buffer | null;
}

async function materializeCandidate(
  archive: ArchiveStore,
  reportId: string,
  src: PortraitSource,
  anchorHash: string | null,
): Promise<PortraitCandidate | null> {
  const buf = await fetchImageBuffer(src.imageUrl);
  if (!buf) return null;

  const saved = archive.savePortrait(reportId, src.id, buf, {
    platform: src.platform,
    label: src.label,
    imageUrl: src.imageUrl,
    role: src.role,
  });

  const dHash = await computeDHash(buf);
  const similarityToAnchor = anchorHash && dHash ? hashSimilarity(anchorHash, dHash) : undefined;
  const matchVerdict = verdictFromSimilarity(similarityToAnchor ?? 0, Boolean(anchorHash));

  return {
    id: src.id,
    label: src.label,
    platform: src.platform,
    profileUrl: src.profileUrl,
    imageUrl: src.imageUrl,
    localPath: saved.archivePath,
    dataUri: bufferToDataUri(buf),
    role: src.role,
    handle: src.handle,
    dHash: dHash || undefined,
    similarityToAnchor,
    matchVerdict: src.role === "anchor" ? "matches-anchor" : matchVerdict,
    hash: saved.hash,
  };
}

export async function buildPortraitIntel(
  archive: ArchiveStore,
  reportId: string,
  subject: SubjectInput,
  opts: PortraitBuildOpts,
): Promise<PortraitIntel> {
  let sources = collectPortraitSourceUrls(subject, opts);
  if (opts.searchHits?.length && !opts.fastMode) {
    sources = await enrichSourcesFromSearchHits(sources, opts.searchHits, 8);
  }
  if (!opts.fastMode) {
    sources = await enrichSourcesWithXOgImage(sources);
  }

  const candidates: PortraitCandidate[] = [];
  let anchorHash: string | null = null;
  let anchorPortrait: PortraitCandidate | undefined;

  if (opts.referencePhotoBuffer?.length) {
    const dHash = await computeDHash(opts.referencePhotoBuffer);
    if (dHash) {
      const saved = archive.savePortrait(reportId, "reference-upload", opts.referencePhotoBuffer, {
        platform: "Reference",
        label: "Investigator reference photo",
        imageUrl: "reference://upload",
        role: "anchor",
      });
      anchorHash = dHash;
      anchorPortrait = {
        id: "reference-upload",
        label: "Investigator reference photo",
        platform: "Reference",
        imageUrl: "reference://upload",
        localPath: saved.archivePath,
        dataUri: bufferToDataUri(opts.referencePhotoBuffer),
        role: "anchor",
        dHash,
        matchVerdict: "matches-anchor",
        hash: saved.hash,
      };
      candidates.push(anchorPortrait);
    }
  }

  const anchorSources = sources.filter((s) => s.role === "anchor");
  const otherSources = sources.filter((s) => s.role !== "anchor");

  for (const src of anchorSources.slice(0, 2)) {
    if (anchorPortrait) break;
    const c = await materializeCandidate(archive, reportId, src, null);
    if (!c?.dHash) continue;
    anchorHash = c.dHash;
    anchorPortrait = { ...c, role: "anchor", matchVerdict: "matches-anchor" };
    candidates.push(anchorPortrait);
    break;
  }

  const limit = opts.fastMode ? 10 : 16;
  for (const src of otherSources.slice(0, limit)) {
    const c = await materializeCandidate(archive, reportId, src, anchorHash);
    if (c) candidates.push(c);
  }

  const homonymProfiles = candidates
    .filter((c) => c.role === "homonym")
    .map((c) => ({
      label: c.label,
      portrait: c,
      distinctFromAnchor: c.matchVerdict === "distinct-person",
      similarity: c.similarityToAnchor,
    }));

  const subjectPortraits = candidates.filter((c) => c.role === "subject-account" || c.role === "anchor");
  const matchedAccounts = subjectPortraits.filter((c) => c.matchVerdict === "matches-anchor" || c.matchVerdict === "likely-same");

  let summary: string;
  if (!anchorPortrait) {
    summary =
      candidates.length > 0
        ? `Collected ${candidates.length} public portrait(s); no anchor reference image for visual comparison.`
        : "No public portrait images discovered from anchor site or linked accounts.";
  } else if (homonymProfiles.length) {
    const distinct = homonymProfiles.filter((h) => h.distinctFromAnchor).length;
    summary = `Anchor portrait from ${anchorPortrait.platform}. ${matchedAccounts.length} account portrait(s) visually align; ${distinct} homonym profile(s) appear visually distinct.`;
  } else {
    summary = `Anchor portrait established (${anchorPortrait.label}). ${matchedAccounts.length} corroborating account image(s) collected.`;
  }

  const history = lookupSubjectHistory(subject.firstName, subject.lastName);
  let finalCandidates: PortraitCandidate[] = candidates.map((c) => ({
    ...c,
    userAssignment: c.userAssignment ?? "pending",
  }));
  let fromHistory = 0;
  if (history?.portraitMemory.length) {
    finalCandidates = applyPortraitMemory(finalCandidates, history.portraitMemory);
    fromHistory = finalCandidates.filter((c) => c.userAssignment && c.userAssignment !== "pending").length;
  }

  const intel: PortraitIntel = {
    anchorPortrait,
    candidates: finalCandidates,
    homonymProfiles,
    summary:
      fromHistory > 0
        ? `${summary} Applied ${fromHistory} portrait label(s) from prior investigations.`
        : summary,
    method: "perceptual-hash-dhash",
    collectedAt: new Date().toISOString(),
    fromHistory,
  };
  intel.disambiguation = buildPortraitDisambiguation(intel);
  return intel;
}

/** Map portrait similarity onto scored accounts by profile URL or handle. */
export function portraitSimilarityForAccount(
  portraitIntel: PortraitIntel | undefined,
  platform: string,
  username: string,
  url: string,
): number | undefined {
  if (!portraitIntel?.anchorPortrait?.dHash) return undefined;
  const handle = username.toLowerCase();
  const urlKey = url.split("#")[0].toLowerCase();
  const match = portraitIntel.candidates.find(
    (c) =>
      (c.role === "subject-account" || c.role === "homonym") &&
      (c.profileUrl?.split("#")[0].toLowerCase() === urlKey ||
        c.handle?.toLowerCase() === handle ||
        (c.platform === platform && c.handle?.toLowerCase() === handle)),
  );
  return match?.similarityToAnchor;
}