import { v4 as uuid } from "uuid";
import path from "node:path";
import { writeFileSync } from "node:fs";
import type { DisambiguationAnswer, OsintReport, RunProgress, SubjectInput } from "./types.js";
import { buildSearchQueries, deriveUsernames, fullName, locationLine, parseSubject, QUERY_CAPS, type QueryMode } from "./modules/subject.js";
import { enrichSubjectRaw } from "./modules/subject-enrich.js";
import { resolveQueryMode } from "./lib/cli-args.js";
import {
  assessSearchBatchHealth,
  buildAnchorFallbackHits,
  buildProfessionalSearchFallback,
  shouldEarlyStopSearch,
} from "./modules/search-resilience.js";
import { isLinkedInProfileUrl } from "./modules/platform-scoring.js";
import { unwrapSearchUrl } from "./modules/search-url.js";
import { getPage, searchWebBatch, capturePage, closeBrowser } from "./browser.js";
import { discoverFromSearch, discoverFromUsernames, mergeSocial } from "./modules/social.js";
import { githubProbeMatchesSubject } from "./modules/platform-scoring.js";
import { analyzeEmail } from "./modules/email.js";
import { analyzePhone } from "./modules/phone-intel.js";
import { analyzeAddress } from "./modules/address.js";
import { disambiguate } from "./modules/disambiguate.js";
import { ArchiveStore } from "./modules/archive.js";
import { buildReport } from "./modules/report.js";
import { ReportStore } from "./store.js";
import { searchWikipedia } from "./modules/wikipedia.js";
import { enrichSearchHits, scoreHitRelevance, verifySocialCandidates } from "./modules/enrich.js";
import { nameMatchesInText } from "./modules/name-variants.js";
import { extractAnchors } from "./modules/anchors.js";
import { probeUsername } from "./modules/username-probe.js";
import { fetchGitHubProfile, fetchGitHubRepos } from "./modules/github.js";
import { analyzeDomain } from "./modules/domain.js";
import { buildIdentityGraph } from "./modules/identity-graph.js";
import { buildInvestigatorBrief } from "./modules/investigator-brief.js";
import { correlateAccounts } from "./modules/account-correlation.js";
import { buildChainOfCustody } from "./modules/chain-of-custody.js";
import { buildReportBasename } from "./modules/report-filename.js";
import { log } from "./lib/logger.js";
import { resolveFlags } from "./modules/investigation-flags.js";
import {
  profileWebsite,
  expandQueriesFromFingerprint,
  probesFromSiteLinks,
  rehydrateSiteFingerprint,
  type SiteFingerprint,
} from "./modules/website-profiler.js";
import { timeloopDomain } from "./modules/archive-timelooper.js";
import { resolveSteamProfile } from "./modules/steam-resolver.js";
import { discoverTwitchFromContent, resolveTwitchChannel, parseTwitchHandle } from "./modules/twitch-resolver.js";
import { scoreAccount, scoreAllAccounts } from "./modules/account-scoring.js";
import { buildPersonaClusters } from "./modules/persona-cluster.js";
import { contentSimilarity } from "./modules/content-fingerprint.js";
import { discoverXAccounts } from "./modules/x-resolver.js";
import {
  filterWikipediaResults,
  wikipediaSearchQuery,
} from "./modules/homonym-exclusions.js";
import { isCommonName } from "./modules/homonym-filter.js";
import { buildPortraitIntel, portraitSimilarityForAccount } from "./modules/portrait-intel.js";
import { verdictFromSimilarity } from "./modules/image-phash.js";
import {
  applyPortraitUserAssignments,
  buildPortraitDisambiguation,
} from "./modules/portrait-disambiguation.js";
import {
  recordSubjectHistory,
  subjectHistoryHint,
} from "./modules/subject-history.js";
import { saveNegativeSignal } from "./modules/negative-signals.js";
import {
  applyIdentitySelection,
  buildIdentityWorkbench,
  excludedUrlsFromProfiles,
} from "./modules/candidate-profiles.js";
import { buildSubjectDossier } from "./modules/dossier.js";
import { enhanceDossierNarrative } from "./modules/dossier-synthesis.js";
import { buildMediaTimeline } from "./modules/media-timeline.js";
import { generateReportPdfFromCase } from "./modules/report-pdf.js";
import { saveReferencePhoto, loadReferencePhotoBuffer } from "./modules/reference-photo.js";
import { buildSocialMetadata } from "./modules/social-metadata.js";
import { generateMonikers } from "./modules/moniker-engine.js";
import { enrichDeepProfiles, deepProfileHasContent } from "./modules/deep-profile.js";
import { filterGalleryPortraits } from "./modules/portrait-quality.js";
import { scoreMultiSignal, lockStatusToTier } from "./modules/multi-signal-scorer.js";
import { buildReverseImagePack } from "./modules/reverse-image.js";
import { clusterPortraits } from "./modules/face-cluster.js";
import { buildPublicRecordDorks } from "./modules/public-records-dorks.js";
import { buildToolkitPackFromSubject } from "./modules/toolkit-resolve.js";
import { analyzeSemanticCorpus } from "./modules/semantic-content.js";
import { resolveBusinessEntities } from "./modules/business-entity.js";
import { buildLifeTimeline } from "./modules/life-timeline.js";
import { applyAttributionGate } from "./modules/attribution-gate.js";
import {
  buildClientExecutiveSummary,
  buildClientReportHtml,
  buildClientReportMarkdown,
} from "./modules/client-report.js";
import { applyHumanLock, attachCorroborate } from "./v9/corroborate.js";
import { writeCaseExports } from "./v9/exports.js";

import { SPECTRA_VERSION } from "./version.js";
export const SPECTRA_ENGINE_VERSION = SPECTRA_VERSION;


type ProgressFn = (p: RunProgress) => void;

const ARCHIVE_ROOT = path.join(process.env.USERPROFILE || process.env.HOME || ".", ".spectra-desk", "cases");

export class SpectraEngine {
  private readonly archive = new ArchiveStore(ARCHIVE_ROOT);
  private readonly store = new ReportStore();

  async runInvestigation(
    raw: Record<string, string | undefined>,
    onProgress?: ProgressFn,
    answers?: DisambiguationAnswer[],
  ): Promise<OsintReport> {
    const enriched = enrichSubjectRaw(raw);
    const queryMode: QueryMode = resolveQueryMode(enriched);
    const subject = parseSubject(enriched);
    const id = `spectra-${uuid().slice(0, 8)}`;
    const createdAt = new Date().toISOString();

    const report: OsintReport = {
      id,
      subject,
      queryFamilies: (raw.families || "").split(",").map((part) => part.trim()).filter(Boolean),
      createdAt,
      status: "running",
      disambiguation: {
        score: 0,
        label: "Pending",
        rationale: [],
        distinguishingSignals: [],
        homonymRisk: "medium",
        candidates: [],
        questions: [],
        refined: false,
      },
      executiveSummary: "",
      searchHits: [],
      excludedHits: [],
      socialCandidates: [],
      usernameProbes: [],
      evidence: [],
      sourceInventory: [],
      markdown: "",
      html: "",
    };

    this.store.save(report);
    const referencePhoto = enriched.referencePhoto;
    return this.executePipeline(report, onProgress, answers, false, queryMode, false, referencePhoto);
  }

  async refineInvestigation(
    reportId: string,
    answers: DisambiguationAnswer[],
    extraFields?: Record<string, string | undefined>,
  ): Promise<OsintReport> {
    const existing = this.store.get(reportId);
    if (!existing) throw new Error(`Report not found: ${reportId}`);

    const merged = { ...existing.subject, ...parseSubject(extraFields || {}) };
    for (const ans of answers) {
      if (ans.questionId === "confirm-employer" && ans.value) merged.employer = ans.value;
      if (ans.questionId === "confirm-location" && ans.value && !merged.city) merged.city = ans.value;
    }

    const priorAnchors = extractAnchors(existing.subject);
    const newAnchors = extractAnchors(merged);
    const anchorsChanged =
      merged.email !== existing.subject.email ||
      merged.username !== existing.subject.username ||
      merged.employer !== existing.subject.employer ||
      newAnchors.domains.join() !== priorAnchors.domains.join();

    const report: OsintReport = {
      ...existing,
      subject: merged,
      status: "running",
    };

    this.store.save(report);
    return this.executePipeline(report, undefined, answers, true, anchorsChanged ? "fast" : "full", anchorsChanged, undefined);
  }

  async probeUsernameOnly(username: string) {
    return probeUsername(username);
  }

  private async executePipeline(
    report: OsintReport,
    onProgress?: ProgressFn,
    answers?: DisambiguationAnswer[],
    isRefine = false,
    queryMode: QueryMode = "full",
    requeryOnRefine = false,
    referencePhotoInput?: string,
  ): Promise<OsintReport> {
    const { subject, id } = report;
    const flags = resolveFlags(undefined, queryMode === "custom" ? "full" : queryMode);
    report.spectraVersion = SPECTRA_ENGINE_VERSION;
    const historyHint = subjectHistoryHint(subject.firstName, subject.lastName);
    if (historyHint) report.subjectHistoryHint = historyHint;
    let siteFp: SiteFingerprint | undefined = isRefine ? rehydrateSiteFingerprint(report) : undefined;
    let extraQueries: string[] = [];
    const progress = (phase: string, percent: number, message: string) =>
      onProgress?.({ phase, percent, message });

    try {
      if (!isRefine && referencePhotoInput) {
        progress("init", 2, "Saving investigator reference photoâ€¦");
        const saved = await saveReferencePhoto(this.archive.caseDir(id), referencePhotoInput);
        if (saved) {
          report.referencePhoto = {
            localPath: saved.localPath,
            hash: saved.hash,
            dataUri: saved.dataUri,
            width: saved.width,
            height: saved.height,
            source: "investigator-upload",
            savedAt: saved.savedAt,
          };
          report.evidence.push(
            this.archive.saveEvidence(id, {
              type: "portrait",
              title: "Investigator reference photo",
              url: "reference://upload",
              excerpt: `${saved.width}Ã - ${saved.height} Â· ${saved.bytes} bytes Â· SHA ${saved.hash.slice(0, 12)}`,
            }),
          );
        }
      }

      if (!isRefine) {
        progress("init", 3, "Initializing private browser...");
        const page = await getPage();
        const anchors = extractAnchors(subject);

        progress("username-probe", 8, "Cross-platform username correlation...");
        const derived = deriveUsernames(subject);
        const usernames = subject.username ? [subject.username] : derived.slice(0, 2);
        const allProbes: import("./types.js").UsernameProbe[] = [];
        for (const u of usernames) {
          const probes = await probeUsername(u);
          allProbes.push(...probes);
          for (const p of probes.filter((x) => x.exists)) {
            if (p.platform === "GitHub" && !githubProbeMatchesSubject(p, subject)) continue;
            report.evidence.push(
              this.archive.saveEvidence(id, {
                type: "username-probe",
                title: `${p.platform}: @${p.username}`,
                url: p.url,
                excerpt: [p.displayName, p.bio, p.linkedUrl].filter(Boolean).join(" | "),
              }),
            );
          }
        }
        const probeMap = new Map<string, import("./types.js").UsernameProbe>();
        for (let p of allProbes) {
          if (p.platform === "GitHub" && p.exists && !githubProbeMatchesSubject(p, subject)) {
            p = { ...p, exists: false, confidence: 18, method: "api", bio: `${p.bio || ""} [GitHub user exists but name/location mismatch]`.trim() };
          }
          const key = `${p.platform}:${p.username.toLowerCase()}`;
          const ex = probeMap.get(key);
          if (!ex || (p.exists && !ex.exists) || (p.exists && p.confidence > ex.confidence)) probeMap.set(key, p);
        }
        report.usernameProbes = [...probeMap.values()];

        const primaryUser = subject.username || usernames[0];
        if (primaryUser) {
          const gh = await fetchGitHubProfile(primaryUser);
          const ghMatches =
            gh &&
            githubProbeMatchesSubject(
              {
                displayName: gh.name || undefined,
                bio: gh.bio || undefined,
                location: gh.location || undefined,
                method: "api",
              },
              subject,
            );
          if (gh && ghMatches) {
            const repos = await fetchGitHubRepos(primaryUser, 6);
            report.githubIntel = {
              login: gh.login,
              name: gh.name,
              bio: gh.bio,
              blog: gh.blog,
              location: gh.location,
              company: gh.company,
              publicRepos: gh.publicRepos,
              followers: gh.followers,
              createdAt: gh.createdAt,
              avatarUrl: gh.avatarUrl,
              url: gh.url,
              repos,
            };
            report.evidence.push(
              this.archive.saveEvidence(id, {
                type: "github",
                title: `GitHub: ${gh.login}`,
                url: gh.url,
                excerpt: [gh.name, gh.bio, gh.blog, gh.location].filter(Boolean).join(" | "),
              }),
            );
          }
        }

        progress("domain", 14, "Domain & site intelligence...");
        for (const d of anchors.domains.slice(0, 2)) {
          const intel = await analyzeDomain(d);
          if (intel) {
            report.domainIntel = intel;
            if (flags.deepDomainCrawl) {
              progress("domain", 15, `Deep profiling ${intel.domain} (robots-aware crawl)â€¦`);
              siteFp = await profileWebsite(intel.domain, flags);
              intel.extractedLinks = siteFp.allExternalLinks
                .filter((l) => l.platform)
                .map((l) => ({
                  url: l.url,
                  platform: l.platform,
                  handle: l.handle,
                  confidence: l.confidence,
                  source: l.source,
                  linkRole: l.linkRole,
                  contextHint: l.contextHint,
                }));
              intel.siteTitle = siteFp.title || intel.siteTitle;
              intel.siteDescription = siteFp.description || intel.siteDescription;
              intel.siteTextSample = siteFp.rawTextSample.slice(0, 1200);
              report.siteFingerprint = {
                domain: siteFp.domain,
                title: siteFp.title,
                pagesCrawled: siteFp.pagesCrawled.length,
                socialLinkCount: siteFp.socialLinks.length,
                songTitles: siteFp.songTitles,
                albumTitles: siteFp.albumTitles,
                uniquePhrases: siteFp.uniquePhrases,
                locationPhrases: siteFp.locationPhrases,
              };
              const fpQueries = expandQueriesFromFingerprint(siteFp, fullName(subject) || "", locationLine(subject));
              const fpCap = queryMode === "fast" ? 10 : queryMode === "validation" ? 6 : 20;
              extraQueries = fpQueries.slice(0, fpCap);
              const siteProbes = probesFromSiteLinks([...siteFp.socialLinks, ...siteFp.allExternalLinks.filter((l) => l.platform)]);
              for (const sp of siteProbes) {
                const key = `${sp.platform}:${sp.username.toLowerCase()}`;
                if (!probeMap.has(key)) probeMap.set(key, sp);
              }
              progress("domain", 16, "Resolving X/Twitter profiles from brand & handle signalsâ€¦");
              const xProbes = await discoverXAccounts(subject, siteFp);
              for (const xp of xProbes) {
                const key = `${xp.platform}:${xp.username.toLowerCase()}`;
                const ex = probeMap.get(key);
                if (!ex || xp.confidence > ex.confidence) probeMap.set(key, xp);
                report.evidence.push(
                  this.archive.saveEvidence(id, {
                    type: "social",
                    title: `X: @${xp.username} (${xp.displayName || "resolved"})`,
                    url: xp.url,
                    excerpt: [xp.displayName, xp.bio].filter(Boolean).join(" | "),
                  }),
                );
              }
              report.usernameProbes = [...probeMap.values()];

              progress("wikipedia", 17, "Wikipedia homonym filter (disambiguated query)â€¦");
              const wikiRaw = await searchWikipedia(wikipediaSearchQuery(subject, siteFp), queryMode === "fast" ? 4 : 6);
              const { relevant, excluded } = filterWikipediaResults(subject, wikiRaw, siteFp);
              report.wikipedia = relevant;
              report.wikipediaExcluded = excluded;
              for (const w of relevant.slice(0, 2)) {
                report.evidence.push(
                  this.archive.saveEvidence(id, { type: "wikipedia", title: w.title, url: w.url, excerpt: w.description }),
                );
              }
            } else if (!siteFp && queryMode !== "fast") {
              progress("wikipedia", 12, "Querying Wikipedia APIâ€¦");
              const wikiRaw = await searchWikipedia(wikipediaSearchQuery(subject), 5);
              const { relevant, excluded } = filterWikipediaResults(subject, wikiRaw);
              report.wikipedia = relevant;
              report.wikipediaExcluded = excluded;
            }
            if (flags.archiveTimeloop) {
              const { snapshots, historicalLinks } = await timeloopDomain(intel.domain);
              for (const snap of snapshots.slice(0, 2)) {
                report.evidence.push(
                  this.archive.saveEvidence(id, {
                    type: "wayback",
                    title: `Wayback CDX: ${intel.domain}`,
                    url: snap.archiveUrl,
                    excerpt: `Historical snapshot ${snap.timestamp}`,
                  }),
                );
              }
              if (historicalLinks.length) {
                extraQueries.push(`site:steamcommunity.com "${fullName(subject)}"`);
                for (const hl of historicalLinks.slice(0, 4)) {
                  const sp = probesFromSiteLinks([hl]);
                  for (const p of sp) probeMap.set(`${p.platform}:${p.username.toLowerCase()}`, p);
                }
              }
            }
            report.evidence.push(
              this.archive.saveEvidence(id, {
                type: "domain",
                title: `Domain: ${intel.domain}`,
                url: intel.url,
                excerpt: [intel.siteTitle, intel.siteDescription, intel.rdap?.registrar, intel.rdap?.created].filter(Boolean).join(" | "),
              }),
            );
            if (intel.wayback?.available && intel.wayback.snapshotUrl) {
              report.evidence.push(
                this.archive.saveEvidence(id, {
                  type: "wayback",
                  title: `Wayback: ${intel.domain}`,
                  url: intel.wayback.snapshotUrl,
                  excerpt: `Snapshot ${intel.wayback.timestamp || "unknown"}`,
                }),
              );
            }
            break;
          }
        }

        report.usernameProbes = [...probeMap.values()];

        if (flags.twitchDiscovery && siteFp) {
          const known = new Set([...probeMap.values()].map((p) => p.username.toLowerCase()));
          const twitchHandles = new Set<string>();
          for (const link of siteFp.allExternalLinks.filter((l) => l.platform === "Twitch" && l.handle)) {
            twitchHandles.add(link.handle!);
          }
          for (const m of siteFp.rawTextSample.matchAll(/twitch\.tv\/([A-Za-z0-9_]{3,25})/gi)) {
            twitchHandles.add(m[1]);
          }
          for (const handle of twitchHandles) {
            const resolved = await resolveTwitchChannel(handle, siteFp);
            if (resolved) probeMap.set(`Twitch:${resolved.username.toLowerCase()}`, resolved);
            known.add(handle.toLowerCase());
          }
          const discovered = await discoverTwitchFromContent(siteFp, known);
          for (const p of discovered) probeMap.set(`${p.platform}:${p.username.toLowerCase()}`, p);
        }

        report.usernameProbes = [...probeMap.values()];

        // --- v7 Toolkit operator pack (public search URL library) ---
        progress("toolkit", 13, "Building Toolkit operator link pack...");
        try {
          report.toolkitPack = buildToolkitPackFromSubject(subject, {
            maxPerKind: queryMode === "validation" ? 4 : queryMode === "fast" ? 8 : 12,
            maxTotal: queryMode === "validation" ? 24 : queryMode === "fast" ? 48 : 80,
          });
        } catch (err) {
          log.info("engine", "Toolkit pack skipped", { error: String(err) });
        }

        // --- v6 Moniker inventory ---
        progress("monikers", 14, "Expanding moniker / alias inventory...");
        const monikers = generateMonikers(subject, { max: queryMode === "validation" ? 16 : 40 });
        report.monikerInventory = monikers;
        // Probe top monikers not already covered
        const knownUsers = new Set(
          [...probeMap.values()].map((p) => p.username.toLowerCase()),
        );
        for (const m of monikers.filter((x) => x.confidence >= 0.7).slice(0, queryMode === "full" ? 4 : 2)) {
          if (knownUsers.has(m.handle.toLowerCase())) continue;
          knownUsers.add(m.handle.toLowerCase());
          try {
            const extra = await probeUsername(m.handle);
            for (const p of extra) {
              const key = `${p.platform}:${p.username.toLowerCase()}`;
              if (!probeMap.has(key)) probeMap.set(key, p);
            }
          } catch {
            /* skip moniker probe failures */
          }
        }
        report.usernameProbes = [...probeMap.values()];

        // --- v6 Deep profile enrichment (content, not mere existence) ---
        progress("enrich", 16, "Deep-enriching public profiles (bio/avatar/location)...");
        try {
          const deep = await enrichDeepProfiles(report.usernameProbes || [], {
            limit: queryMode === "validation" ? 6 : queryMode === "fast" ? 8 : 12,
            concurrency: 4,
          });
          report.deepProfiles = deep.map((d) => ({
            platform: d.platform,
            username: d.username,
            url: d.url,
            exists: d.exists,
            displayName: d.displayName,
            bio: d.bio,
            locationText: d.locationText,
            avatarUrl: d.avatarUrl,
            website: d.website,
            method: d.method,
            hasContent: deepProfileHasContent(d),
            contentHash: d.contentHash,
          }));
          // Propagate bio/location back onto probes when enriched
          for (const d of deep) {
            if (!deepProfileHasContent(d)) continue;
            const key = `${d.platform}:${d.username.toLowerCase()}`;
            const probe = probeMap.get(key);
            if (probe) {
              if (d.displayName) probe.displayName = d.displayName;
              if (d.bio) probe.bio = d.bio;
              if (d.locationText) probe.location = d.locationText;
              if (d.website) probe.linkedUrl = d.website;
            }
          }
          report.usernameProbes = [...probeMap.values()];
        } catch (err) {
          log.info("engine", "Deep profile enrichment skipped", { error: String(err) });
        }

        const families = report.queryFamilies || [];
        const cap = QUERY_CAPS[queryMode];
        progress("search", 18, `Running public web reconnaissance (${queryMode} mode, ${cap} queries max)...`);
        const publicDorks = buildPublicRecordDorks(subject, queryMode === "custom" ? "full" : queryMode);
        const queries = [...new Set([
          ...buildSearchQueries(subject, queryMode, families),
          ...publicDorks,
          ...extraQueries,
        ])].slice(0, cap);
        const allHits = [];
        const anchorFallbackReady = anchors.domains.length > 0 || Boolean(report.githubIntel);
        const batchResults = await searchWebBatch(
          queries,
          4,
          queryMode === "validation" ? 2 : queryMode === "fast" ? 2 : 3,
          (q, i, total) => {
            progress("search", 18 + Math.floor((i / total) * 30), `Searching: ${q}`);
          },
          (processed, partial) => {
            const h = assessSearchBatchHealth(partial);
            return shouldEarlyStopSearch(processed, queries.length, h, anchorFallbackReady);
          },
        );
        for (const [q, hits] of batchResults) {
          for (const h of hits) {
            const url = unwrapSearchUrl(h.url);
            if (/bing\.com\/ck\//i.test(url)) continue;
            allHits.push({
              title: h.title,
              url,
              snippet: h.snippet,
              source: h.source ?? "brave/duckduckgo",
              query: q,
              relevanceScore: scoreHitRelevance({ ...h, url }, subject, nameMatchesInText),
            });
          }
        }

        const searchHealth = assessSearchBatchHealth(batchResults);
        // Always inject professional pivot when no LinkedIn profile surfaced (site:linkedin is often blocked)
        if (!allHits.some((h) => isLinkedInProfileUrl(h.url))) {
          for (const h of buildProfessionalSearchFallback(subject)) {
            if (allHits.some((x) => x.url.split("#")[0] === h.url.split("#")[0])) continue;
            allHits.push({
              title: h.title,
              url: h.url,
              snippet: h.snippet,
              source: h.source ?? "professional-pivot",
              query: "professional-pivot",
              relevanceScore: scoreHitRelevance(h, subject, nameMatchesInText) + 20,
            });
            searchHealth.fallbackHits += 1;
          }
        }
        if (searchHealth.degraded || allHits.length < 3) {
          const fallbacks = buildAnchorFallbackHits(subject, report.githubIntel, report.domainIntel);
          for (const h of fallbacks) {
            if (allHits.some((x) => x.url.split("#")[0] === h.url.split("#")[0])) continue;
            allHits.push({
              title: h.title,
              url: h.url,
              snippet: h.snippet,
              source: h.source ?? "anchor-fallback",
              query: "anchor-fallback",
              relevanceScore: scoreHitRelevance(h, subject, nameMatchesInText) + 15,
            });
          }
          searchHealth.fallbackHits = (searchHealth.fallbackHits || 0) + fallbacks.length;
        }
        report.searchHealth = {
          attempted: searchHealth.attempted,
          withHits: searchHealth.withHits,
          degraded: searchHealth.degraded,
          fallbackHits: searchHealth.fallbackHits,
          enginesBlocked: searchHealth.degraded,
        };

        for (const p of [...probeMap.values()].filter((x) => x.exists && x.linkedUrl)) {
          const linked = p.linkedUrl!;
          allHits.push({
            title: `${p.platform} profile link: ${linked}`,
            url: linked.startsWith("http") ? linked : `https://${linked}`,
            snippet: p.displayName || p.username,
            source: "username-probe",
            query: `probe:${p.platform}`,
            relevanceScore: 85,
          });
        }

        if (
          allHits.length === 0 &&
          report.wikipedia?.length &&
          !isCommonName(subject.firstName, subject.lastName)
        ) {
          for (const w of report.wikipedia) {
            allHits.push({
              title: w.title,
              url: w.url,
              snippet: w.description,
              source: "wikipedia-fallback",
              query: fullName(subject),
              relevanceScore: scoreHitRelevance({ title: w.title, snippet: w.description, url: w.url }, subject, nameMatchesInText),
            });
          }
        }

        const { kept, excluded } = enrichSearchHits(allHits, subject);
        report.searchHits = kept;
        report.excludedHits = excluded;

        if (siteFp) {
          for (const h of kept) {
            if (flags.steamDiscovery && /steamcommunity\.com\/profiles\/\d{17}/i.test(h.url)) {
              const resolved = await resolveSteamProfile(h.url, siteFp.rawTextSample);
              if (resolved) probeMap.set(`Steam:${resolved.username}`, resolved);
            }
            const twitchHandle = parseTwitchHandle(h.url);
            if (flags.twitchDiscovery && twitchHandle) {
              const resolved = await resolveTwitchChannel(twitchHandle, siteFp);
              if (resolved && resolved.confidence >= 55) {
                probeMap.set(`Twitch:${resolved.username.toLowerCase()}`, resolved);
              }
            }
          }
          if (flags.steamDiscovery) {
            for (const link of siteFp.socialLinks.filter((l) => l.platform === "Steam")) {
              const resolved = await resolveSteamProfile(link.url, siteFp.rawTextSample);
              if (resolved) probeMap.set(`Steam:${resolved.username.toLowerCase()}`, resolved);
            }
          }
          report.usernameProbes = [...probeMap.values()];
        }

        for (const h of kept.slice(0, 12)) {
          report.evidence.push(
            this.archive.saveEvidence(id, { type: "search", title: h.title, url: h.url, excerpt: h.snippet || h.query }),
          );
        }

        progress("social", 52, "Mapping & verifying public social footprint...");
        const fromSearch = discoverFromSearch(kept, subject);
        const fromUsernames = discoverFromUsernames(subject);
        const sameAsUrls = siteFp
          ? new Set(siteFp.allExternalLinks.filter((l) => l.inSchemaSameAs).map((l) => l.url.split("#")[0]))
          : undefined;
        const scoredForSocial = scoreAllAccounts(report.usernameProbes || [], subject, {
          siteLinks: siteFp?.allExternalLinks,
          promoteHttpProbe: flags.promoteHttpProbe,
          anchorDomain: report.domainIntel?.domain,
          sameAsUrls,
        });
        const fromProbes = scoredForSocial
          .filter((s) => s.tier !== "quarantined" && s.linkOwnership !== "collaborator")
          .map((s) => ({
            platform: s.platform,
            url: s.url,
            confidence: Math.round(s.posterior * 100),
            method: (s.tier === "attributed" ? "verified" : "search-hit") as "verified" | "search-hit",
            status: (s.tier === "attributed" ? "verified" : "found") as "verified" | "found",
            verified: s.tier === "attributed",
          }));
        const merged = mergeSocial(mergeSocial(fromSearch, fromUsernames), fromProbes);
        report.socialCandidates = await verifySocialCandidates(merged, 14);

        for (const social of report.socialCandidates.filter((s) => s.status === "found" || s.status === "verified").slice(0, 5)) {
          report.evidence.push(
            this.archive.saveEvidence(id, {
              type: "social",
              title: `${social.platform} profile`,
              url: social.url,
              excerpt: `${social.status} via ${social.method}, confidence ${social.confidence}%`,
            }),
          );
        }

        progress("email", 58, "Analyzing email (public signals only)...");
        if (subject.email) {
          report.emailIntel = await analyzeEmail(subject.email, kept);
          report.evidence.push(
            this.archive.saveEvidence(id, {
              type: "email",
              title: `Email intel: ${subject.email}`,
              url: `mailto:${subject.email}`,
              excerpt: `Domain ${report.emailIntel.domain}, Gravatar: ${report.emailIntel.gravatarExists ? "yes" : "no"}`,
            }),
          );
          if (report.emailIntel.breachIntel?.checked && report.emailIntel.breachIntel.breaches.length) {
            report.evidence.push(
              this.archive.saveEvidence(id, {
                type: "breach",
                title: `Breach index: ${subject.email}`,
                url: `https://haveibeenpwned.com/account/${encodeURIComponent(subject.email!)}`,
                excerpt: report.emailIntel.breachIntel.breaches.map((b) => b.name).join(", "),
              }),
            );
          }
        }

        if (subject.phone) {
          progress("phone", 60, "Normalizing phone & building public pivots...");
          report.phoneIntel = await analyzePhone(subject.phone, subject);
          report.evidence.push(
            this.archive.saveEvidence(id, {
              type: "phone",
              title: `Phone intel: ${subject.phone}`,
              url: `tel:${subject.phone}`,
              excerpt: report.phoneIntel.normalized || report.phoneIntel.raw,
            }),
          );
        }

        progress("address", 62, "Geocoding address...");
        if (subject.address || subject.city) {
          report.addressIntel = await analyzeAddress(subject);
          if (report.addressIntel) {
            report.evidence.push(
              this.archive.saveEvidence(id, {
                type: "address",
                title: "Address geocode",
                url: report.addressIntel.mapUrl || `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(report.addressIntel.raw)}`,
                excerpt: report.addressIntel.geocoded?.displayName || report.addressIntel.raw,
              }),
            );
          }
        }

        progress("capture", 72, "Archiving corroborated pages...");
        const captureUrls = new Set<string>();
        if (report.domainIntel?.url) captureUrls.add(report.domainIntel.url);
        if (report.githubIntel?.url) captureUrls.add(report.githubIntel.url);
        for (const h of kept.filter((x) => x.classification === "corroborated").slice(0, 4)) captureUrls.add(h.url);

        for (const url of captureUrls) {
          try {
            const cap = await capturePage(page, url);
            report.evidence.push(
              this.archive.saveEvidence(id, {
                type: "page-capture",
                title: cap.title || url,
                url: cap.url,
                excerpt: cap.text.slice(0, 500),
              }),
            );
          } catch {
            continue;
          }
        }
      } else {
        progress("refine", 25, "Applying disambiguation answers...");
        log.info("engine", "Refine pipeline", { reportId: id, requeryOnRefine, priorHits: report.searchHits.length });

        if (requeryOnRefine) {
          progress("refine", 35, "Re-querying with updated anchors (fast mode)...");
          const queries = buildSearchQueries(subject, "fast");
          const batchResults = await searchWebBatch(queries, 4, 3, (q, i, total) => {
            progress("refine", 35 + Math.floor((i / total) * 25), `Refine search: ${q}`);
          });
          const newHits = [];
          for (const [q, hits] of batchResults) {
            for (const h of hits) {
              newHits.push({
                ...h,
                source: "brave/duckduckgo",
                query: q,
                relevanceScore: scoreHitRelevance(h, subject, nameMatchesInText),
              });
            }
          }
          const seen = new Set(report.searchHits.map((h) => h.url.split("#")[0]));
          for (const h of newHits) {
            const key = h.url.split("#")[0];
            if (!seen.has(key)) {
              seen.add(key);
              report.searchHits.push(h);
            }
          }
          const { kept, excluded } = enrichSearchHits(report.searchHits, subject);
          report.searchHits = kept;
          report.excludedHits = excluded;
          log.info("engine", "Refine re-query complete", { kept: kept.length, excluded: excluded.length });
        }

        if (answers?.some((a) => a.questionId === "pick-candidate" && a.value !== "none")) {
          const picked = report.disambiguation.candidates.find((c) => c.id === answers.find((a) => a.questionId === "pick-candidate")?.value);
          if (picked) {
            try {
              const page = await getPage();
              const cap = await capturePage(page, picked.sourceUrl);
              report.evidence.push(
                this.archive.saveEvidence(id, {
                  type: "page-capture",
                  title: `Confirmed: ${cap.title}`,
                  url: cap.url,
                  excerpt: cap.text.slice(0, 500),
                }),
              );
            } catch {
              /* skip */
            }
          }
        }
      }

      if (!isRefine) {
        progress("portraits", 78, "Collecting public portraits & visual homonym check...");
        try {
          const refBuf =
            report.referencePhoto?.localPath
              ? loadReferencePhotoBuffer(this.archive.caseDir(id))
              : null;
          report.portraitIntel = await buildPortraitIntel(this.archive, id, subject, {
            siteFp,
            githubIntel: report.githubIntel,
            emailIntel: report.emailIntel,
            usernameProbes: report.usernameProbes,
            domainUrl: report.domainIntel?.url,
            fastMode: queryMode === "fast",
            searchHits: report.searchHits,
            referencePhotoBuffer: refBuf,
          });
          // v6: reject platform logos / non-face chrome from gallery path
          if (report.portraitIntel?.candidates?.length) {
            const { kept, rejected } = filterGalleryPortraits(report.portraitIntel.candidates);
            report.portraitIntel.candidates = kept;
            if (rejected.length) {
              report.portraitIntel.summary = [
                report.portraitIntel.summary,
                `Rejected ${rejected.length} non-face/logo portrait(s).`,
              ]
                .filter(Boolean)
                .join(" ");
            }
            // Prefer deep-profile avatars as portrait sources when gallery empty
            if (kept.length === 0 && report.deepProfiles?.length) {
              for (const d of report.deepProfiles.filter((x) => x.avatarUrl)) {
                const qOk = filterGalleryPortraits([
                  {
                    id: `deep-${d.platform}-${d.username}`,
                    label: `${d.platform} @${d.username}`,
                    platform: d.platform,
                    profileUrl: d.url,
                    imageUrl: d.avatarUrl!,
                    role: "subject-account" as const,
                    handle: d.username,
                    matchVerdict: "unknown" as const,
                  },
                ]);
                report.portraitIntel.candidates.push(...qOk.kept);
              }
            }
          }
          // v6 reverse-image query pack for operator / MCP
          const faceUrls = (report.portraitIntel?.candidates || []).map((c) => c.imageUrl).filter(Boolean);
          if (faceUrls.length) {
            const pack = buildReverseImagePack(faceUrls.slice(0, 3));
            report.reverseImageQueries = pack.queries.map((q) => ({
              engine: q.engine,
              pageUrl: q.pageUrl,
              notes: q.notes,
            }));
          }
          for (const p of report.portraitIntel.candidates.slice(0, 12)) {
            report.evidence.push(
              this.archive.saveEvidence(id, {
                type: "portrait",
                title: `Portrait: ${p.label}`,
                url: p.imageUrl,
                excerpt: `${p.platform} · ${p.role} · ${p.matchVerdict}${p.similarityToAnchor != null ? ` · ${(p.similarityToAnchor * 100).toFixed(0)}%` : ""}`,
              }),
            );
          }
        } catch (err) {
          log.info("engine", "Portrait collection skipped", { error: String(err) });
        }
      }

      progress("disambiguate", 88, "Scoring disambiguation & building identity graph...");
      const socialVerified = report.socialCandidates.filter((s) => s.status === "verified" || s.status === "found").length;
      report.disambiguation = disambiguate(
        subject,
        report.searchHits,
        socialVerified,
        report.wikipedia || [],
        answers,
        report.excludedHits?.length || 0,
        { github: report.githubIntel, domain: report.domainIntel },
        report.socialCandidates,
      );

      const sameAsUrls = siteFp
        ? new Set(siteFp.allExternalLinks.filter((l) => l.inSchemaSameAs).map((l) => l.url.split("#")[0]))
        : undefined;
      const scoreOpts = {
        siteLinks: siteFp?.allExternalLinks,
        promoteHttpProbe: flags.promoteHttpProbe,
        anchorDomain: report.domainIntel?.domain,
        sameAsUrls,
      };
      const hasAnchorPortrait = Boolean(report.portraitIntel?.anchorPortrait?.dHash);
      const scoredAccounts = (report.usernameProbes || [])
        .filter((p) => p.exists)
        .map((probe) => {
          const contentSim =
            probe.bio && siteFp?.rawTextSample ? contentSimilarity(siteFp.rawTextSample, probe.bio) : undefined;
          const sim = portraitSimilarityForAccount(report.portraitIntel, probe.platform, probe.username, probe.url);
          const verdict =
            sim != null ? verdictFromSimilarity(sim, hasAnchorPortrait) : undefined;
          return scoreAccount(probe, subject, {
            ...scoreOpts,
            contentSimilarity: contentSim,
            portraitSimilarity: sim,
            portraitVerdict: verdict,
          });
        })
        .sort((a, b) => b.posterior - a.posterior);
      report.scoredAccounts = scoredAccounts.map((s) => ({
        platform: s.platform,
        username: s.username,
        url: s.url,
        posterior: Math.round(s.posterior * 1000) / 1000,
        tier: s.tier,
        evidence: s.evidence,
        displayName: s.displayName,
        contentSimilarity: s.contentSimilarity,
        portraitSimilarity: s.portraitSimilarity,
        portraitVerdict: s.portraitVerdict,
        linkOwnership: s.linkOwnership,
        ownershipNote: s.ownershipNote,
      }));
      // --- v8 Semantic content + business + life timeline ---
      progress("semantic", 88, "Semantic content understanding & persona clustering...");
      const semantic = analyzeSemanticCorpus(report.searchHits, subject);
      report.semanticAnalysis = {
        lifeStages: semantic.lifeStages,
        continuityScore: semantic.continuityScore,
        fusedOccupations: semantic.fusedOccupations,
        fusedOrganizations: semantic.fusedOrganizations,
        fusedLocations: semantic.fusedLocations,
        narrativeHints: semantic.narrativeHints,
        contradictionFlags: semantic.contradictionFlags,
      };

      const businesses = resolveBusinessEntities(subject, report.searchHits, {
        domainIntelDomain: report.domainIntel?.domain,
        siteTitle: report.domainIntel?.siteTitle,
        siteDescription: report.domainIntel?.siteDescription,
      });
      report.businessEntities = businesses.entities.map((e) => ({
        id: e.id,
        legalName: e.legalName,
        role: e.role,
        industry: e.industry,
        strength: e.strength,
        confidence: e.confidence,
        domain: e.domain,
        locations: e.locations,
        signals: e.signals,
        sourceUrls: e.sourceUrls,
        personLinkRationale: e.personLinkRationale,
      }));

      const lifeTimeline = buildLifeTimeline(subject, semantic, businesses.entities);
      report.lifeTimeline = {
        narrativeArc: lifeTimeline.narrativeArc,
        continuityAssessment: lifeTimeline.continuityAssessment,
        events: lifeTimeline.events.map((e) => ({
          id: e.id,
          dateLabel: e.dateLabel,
          title: e.title,
          description: e.description,
          category: e.category,
          confidence: e.confidence,
          sourceUrl: e.sourceUrl,
        })),
        personaStages: lifeTimeline.personaStages,
        openQuestions: lifeTimeline.openQuestions,
      };

      const personas = buildPersonaClusters(scoredAccounts, siteFp, {
        semantic,
        businesses: businesses.entities,
      });
      report.personaClusters = personas.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        accountCount: p.accounts.length,
        confidence: p.confidence,
        lifeStages: p.lifeStages,
        competing: p.competing,
      }));

      report.accountCorrelation = correlateAccounts(
        (report.usernameProbes || []).filter((p) => {
          const s = scoredAccounts.find((x) => x.url === p.url);
          return !s || s.tier !== "quarantined";
        }),
        report.githubIntel,
      );
      report.chainOfCustody = buildChainOfCustody(id, report.createdAt, report.evidence);
      report.identityGraph = buildIdentityGraph(report, report.usernameProbes || [], scoredAccounts);
      report.investigatorBrief = buildInvestigatorBrief(
        report,
        report.usernameProbes || [],
        report.accountCorrelation,
        scoredAccounts,
      );

      // --- v6/v8 Multi-signal identity lock (authoritative tier) ---
      progress("lock", 90, "Multi-signal identity lock evaluation...");
      const faceClusters = clusterPortraits(report.portraitIntel?.candidates || [], {
        anchorHash: report.portraitIntel?.anchorPortrait?.dHash,
      });
      const faceMatchCount =
        (report.portraitIntel?.candidates || []).filter(
          (c) => c.matchVerdict === "matches-anchor" || c.matchVerdict === "likely-same",
        ).length + (faceClusters.clusters.some((c) => c.size >= 2) ? 1 : 0);
      const attributedAccountCount = scoredAccounts.filter((s) => s.tier === "attributed").length;
      const identityLock = scoreMultiSignal({
        subject,
        hits: report.searchHits,
        excludedCount: report.excludedHits?.length || 0,
        probes: report.usernameProbes || [],
        deepProfiles: (report.deepProfiles || []).map((d) => ({
          platform: d.platform,
          username: d.username,
          url: d.url,
          exists: d.exists,
          displayName: d.displayName,
          bio: d.bio,
          locationText: d.locationText,
          avatarUrl: d.avatarUrl,
          website: d.website,
          extractedAt: new Date().toISOString(),
          method: (d.method as "api" | "og-html" | "http-probe" | "none") || "http-probe",
        })),
        portraits: report.portraitIntel?.candidates,
        hasLinkedInPivot: report.searchHits.some((h) => /linkedin\.com\/pub\/dir/i.test(h.url)),
        hasReferencePhoto: Boolean(report.referencePhoto),
        faceMatchCount,
        operatorConfirmed: answers?.some((a) => a.questionId === "pick-candidate" && a.value !== "none"),
        businessFusionScore: businesses.fusionScore,
        businessStrength: businesses.primary?.strength,
        continuityScore: semantic.continuityScore,
        attributedAccountCount,
        semanticContentBoost: Math.min(
          16,
          semantic.fusedOccupations.length * 3 + semantic.fusedOrganizations.length * 4,
        ),
      });
      report.identityLock = identityLock;
      // Align disambiguation score + brief tier with lock honesty
      report.disambiguation.score = identityLock.score;
      report.disambiguation.rationale = [
        ...report.disambiguation.rationale,
        ...identityLock.rationale,
        `Identity lock: ${identityLock.status} (structural ${identityLock.structuralScore} / content ${identityLock.contentScore} / visual ${identityLock.visualScore}${identityLock.businessScore != null ? ` / business ${identityLock.businessScore}` : ""}${identityLock.officialRecordScore != null ? ` / records ${identityLock.officialRecordScore}` : ""})`,
      ];
      if (report.investigatorBrief) {
        report.investigatorBrief.confidenceTier = lockStatusToTier(identityLock.status);
        report.investigatorBrief.recommendedActions = [
          ...identityLock.nextActions,
          ...(report.investigatorBrief.recommendedActions || []),
        ].slice(0, 12);
        if (lifeTimeline.narrativeArc) {
          report.investigatorBrief.assessment = `${lifeTimeline.narrativeArc.slice(0, 400)} ${report.investigatorBrief.assessment}`;
        }
      }

      report.identityWorkbench = buildIdentityWorkbench(report);
      report.mediaTimeline = buildMediaTimeline(report);
      report.socialMetadata = buildSocialMetadata(report);

      const gate = applyAttributionGate({
        probes: report.usernameProbes || [],
        scored: report.scoredAccounts || [],
        hits: report.searchHits,
        media: report.mediaTimeline?.entries,
        semanticHits: semantic.hits,
      });
      report.attributionGate = {
        probesTotal: gate.stats.probesTotal,
        probesMain: gate.stats.probesMain,
        probesAppendix: gate.stats.probesAppendix,
        hitsMain: gate.stats.hitsMain,
        hitsAppendix: gate.stats.hitsAppendix,
        mainAccounts: gate.mainAccounts,
      };

      progress("dossier", 92, "Building subject dossier...");
      let dossier = buildSubjectDossier(report, "", { business: businesses, timeline: lifeTimeline });
      dossier.identityStatus = identityLock.status;
      dossier.identityLocked = identityLock.status === "locked";
      dossier.nextActions = identityLock.nextActions;
      dossier.confidenceTier = lockStatusToTier(identityLock.status);
      // Strip logo portraits from dossier photos
      if (dossier.photos?.length) {
        const filtered = filterGalleryPortraits(
          dossier.photos.map((p, i) => ({
            id: p.id || `dossier-photo-${i}`,
            label: p.label,
            platform: p.platform,
            profileUrl: p.profileUrl,
            imageUrl: p.imageUrl,
            role: "corroborating" as const,
            matchVerdict: "unknown" as const,
          })),
        );
        const keepIds = new Set(filtered.kept.map((k) => k.imageUrl));
        dossier.photos = dossier.photos.filter((p) => keepIds.has(p.imageUrl));
      }
      progress("dossier", 94, "Synthesizing dossier narrative...");
      dossier = await enhanceDossierNarrative(dossier);
      dossier.identityStatus = identityLock.status;
      dossier.identityLocked = identityLock.status === "locked";
      dossier.nextActions = identityLock.nextActions;
      report.dossier = dossier;

      const clientCtx = {
        gate,
        semantic,
        businesses,
        timeline: lifeTimeline,
        identityLock,
      };
      attachCorroborate(report);
      report.clientMarkdown = buildClientReportMarkdown(report, clientCtx);

      progress("report", 96, "Synthesizing client intelligence brief...");
      report.completedAt = new Date().toISOString();
      report.exportBasename = buildReportBasename(subject, report.completedAt);
      // v8: primary HTML is client-ready brief; full investigator appendix via buildReport
      const clientHtml = buildClientReportHtml(report, clientCtx);
      const built = buildReport({ ...report, status: "complete" });
      // Prefer client executive summary + client HTML as primary deliverable
      report.executiveSummary = buildClientExecutiveSummary(report, clientCtx);
      report.markdown = report.clientMarkdown || built.markdown;
      report.html = clientHtml;
      report.sourceInventory = built.sourceInventory;
      report.status =
        report.disambiguation.questions.length > 0 && !report.disambiguation.refined && report.disambiguation.score < 80
          ? "needs_refinement"
          : "complete";

      this.archive.saveManifest(id, report.chainOfCustody);
      report.exportFilename = this.archive.saveReport(id, report.markdown, report.html, subject, report.completedAt);
      try {
        writeCaseExports(this.archive.caseDir(id), report);
      } catch (err) {
        log.info("engine", "v9 exports skipped", { error: String(err) });
      }
      try {
        progress("export", 98, "Generating PDF dossierâ€¦");
        const pdf = await generateReportPdfFromCase(this.archive.caseDir(id), id, report.exportFilename);
        if (pdf) report.pdfFilename = pdf;
      } catch (err) {
        log.info("engine", "PDF export skipped", { error: String(err) });
      }
      recordSubjectHistory(report);
      this.store.save(report);

      progress("done", 100, "Report complete");
      return report;
    } catch (error) {
      report.status = "error";
      report.executiveSummary = `Investigation failed: ${error instanceof Error ? error.message : String(error)}`;
      this.store.save(report);
      throw error;
    } finally {
      await closeBrowser();
    }
  }

  async applyPortraitAssignments(
    reportId: string,
    assignments: Array<{ portraitId: string; assignment: "subject" | "homonym" | "reject" }>,
  ): Promise<OsintReport> {
    const report = this.store.get(reportId);
    if (!report?.portraitIntel) throw new Error("Report has no portrait data");

    report.portraitIntel = applyPortraitUserAssignments(report.portraitIntel, assignments);
    report.portraitIntel.disambiguation = buildPortraitDisambiguation(report.portraitIntel);

    const { subject } = report;
    for (const a of assignments) {
      const portrait = report.portraitIntel.candidates.find((c) => c.id === a.portraitId);
      if (!portrait?.profileUrl) continue;
      if (a.assignment === "homonym" || a.assignment === "reject") {
        saveNegativeSignal(
          subject.firstName,
          subject.lastName,
          portrait.profileUrl,
          portrait.label,
          `Portrait disambiguation: ${a.assignment}`,
        );
        if (!report.excludedHits) report.excludedHits = [];
        if (!report.excludedHits.some((h) => h.url === portrait.profileUrl)) {
          report.excludedHits.push({
            title: portrait.label,
            url: portrait.profileUrl,
            snippet: `Excluded via portrait UI (${a.assignment})`,
            source: "portrait-ui",
            query: "",
            classification: "excluded",
            exclusionReason: `User marked portrait as ${a.assignment}`,
          });
        }
      }
    }

    const hasAnchorPortrait = Boolean(report.portraitIntel.anchorPortrait?.dHash);
    const siteFp = rehydrateSiteFingerprint(report);
    const flags = resolveFlags(undefined, "fast");
    const scoreOpts = {
      siteLinks: siteFp?.allExternalLinks,
      promoteHttpProbe: flags.promoteHttpProbe,
      anchorDomain: report.domainIntel?.domain,
    };

    const scoredAccounts = (report.usernameProbes || [])
      .filter((p) => p.exists)
      .map((probe) => {
        const contentSim =
          probe.bio && siteFp?.rawTextSample ? contentSimilarity(siteFp.rawTextSample, probe.bio) : undefined;
        const sim = portraitSimilarityForAccount(
          report.portraitIntel,
          probe.platform,
          probe.username,
          probe.url,
        );
        const verdict = sim != null ? verdictFromSimilarity(sim, hasAnchorPortrait) : undefined;
        return scoreAccount(probe, subject, {
          ...scoreOpts,
          contentSimilarity: contentSim,
          portraitSimilarity: sim,
          portraitVerdict: verdict,
        });
      })
      .sort((a, b) => b.posterior - a.posterior);

    report.scoredAccounts = scoredAccounts.map((s) => ({
      platform: s.platform,
      username: s.username,
      url: s.url,
      posterior: Math.round(s.posterior * 1000) / 1000,
      tier: s.tier,
      evidence: s.evidence,
      displayName: s.displayName,
      contentSimilarity: s.contentSimilarity,
      portraitSimilarity: s.portraitSimilarity,
      portraitVerdict: s.portraitVerdict,
      linkOwnership: s.linkOwnership,
      ownershipNote: s.ownershipNote,
    }));

    report.disambiguation.refined = true;
    report.identityWorkbench = buildIdentityWorkbench(report);
    report.dossier = buildSubjectDossier(report, report.dossier?.investigatorNotes);
    const built = buildReport({ ...report, status: report.status });
    Object.assign(report, built);
    recordSubjectHistory(report);
    this.store.save(report);
    return report;
  }

  saveDossierNotes(reportId: string, notes: string): OsintReport {
    const report = this.store.get(reportId);
    if (!report) throw new Error(`Report not found: ${reportId}`);
    report.dossier = buildSubjectDossier(report, notes);
    const built = buildReport({ ...report, status: report.status });
    Object.assign(report, built);
    this.store.save(report);
    const caseDir = this.archive.caseDir(reportId);
    writeFileSync(
      path.join(caseDir, "DOSSIER-NOTES.txt"),
      notes,
      "utf8",
    );
    return report;
  }

  async confirmIdentity(
    reportId: string,
    body: { targetId: string; excludedIds?: string[]; mergeIds?: string[] },
  ): Promise<OsintReport> {
    const report = this.store.get(reportId);
    if (!report?.identityWorkbench) throw new Error("Report has no identity workbench");

    const workbench = applyIdentitySelection(
      report.identityWorkbench,
      body.targetId,
      body.excludedIds || [],
      body.mergeIds || [],
    );
    report.identityWorkbench = workbench;

    const { subject } = report;
    for (const url of excludedUrlsFromProfiles(workbench.profiles)) {
      saveNegativeSignal(
        subject.firstName,
        subject.lastName,
        url,
        workbench.profiles.find((p) => p.sourceUrls.includes(url))?.displayName || url,
        "Excluded via identity workbench",
      );
      if (!report.excludedHits) report.excludedHits = [];
      if (!report.excludedHits.some((h) => h.url.split("#")[0] === url.split("#")[0])) {
        report.excludedHits.push({
          title: `Excluded candidate: ${url}`,
          url,
          snippet: "User excluded via identity workbench",
          source: "identity-workbench",
          query: "",
          classification: "excluded",
          exclusionReason: "Wrong identity - investigator confirmed different TARGET",
        });
      }
    }

    const target = workbench.profiles.find((p) => p.id === body.targetId);
    if (target) {
      report.disambiguation = {
        ...report.disambiguation,
        refined: true,
        score: Math.min(100, report.disambiguation.score + 12),
        rationale: [
          ...report.disambiguation.rationale,
          `Investigator confirmed TARGET: ${target.displayName.slice(0, 80)}`,
        ],
      };
    }

    report.mediaTimeline = buildMediaTimeline(report);
    report.socialMetadata = buildSocialMetadata(report);
    let dossier = buildSubjectDossier(report, report.dossier?.investigatorNotes);
    dossier = await enhanceDossierNarrative(dossier);
    report.dossier = dossier;
    const built = buildReport({ ...report, status: "complete" });
    Object.assign(report, built);
    try {
      const pdf = await generateReportPdfFromCase(this.archive.caseDir(reportId), reportId, report.exportFilename);
      if (pdf) report.pdfFilename = pdf;
    } catch {
      /* skip */
    }
    recordSubjectHistory(report);
    this.store.save(report);
    return report;
  }

  lockByHuman(reportId: string): OsintReport {
    const report = this.store.get(reportId);
    if (!report) throw new Error(`Report not found: ${reportId}`);
    applyHumanLock(report);
    this.store.save(report);
    try {
      writeCaseExports(this.archive.caseDir(reportId), report);
    } catch {
      /* case folder may not exist for a stored-only report */
    }
    return report;
  }

  getReport(id: string) {
    return this.store.get(id);
  }

  listReports() {
    return this.store.list();
  }
}
