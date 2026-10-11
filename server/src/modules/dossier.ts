import type {
  CandidateProfile,
  DossierContact,
  DossierEmployment,
  DossierPhoto,
  DossierSocialProfile,
  OsintReport,
  PortraitCandidate,
  SubjectDossier,
} from "../types.js";
import { extractFactsFromText, mergeExtracted, toContacts } from "./dossier-extract.js";
import { fullName, locationLine } from "./subject.js";
import { filterDossierSocialForClient, sanitizeOrganizationName } from "./attribution-gate.js";
import type { BusinessResolution } from "./business-entity.js";
import type { LifeTimeline } from "./life-timeline.js";

const NEWS_DOMAINS =
  /(?:reuters|bbc\.co|nytimes|washingtonpost|theguardian|apnews|cnn\.com|npr\.org|bloomberg|forbes|techcrunch)/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function targetProfile(report: OsintReport): CandidateProfile | undefined {
  const wb = report.identityWorkbench;
  if (!wb?.confirmed || !wb.selectedTargetId) return undefined;
  return wb.profiles.find((p) => p.id === wb.selectedTargetId);
}

function corpusTexts(report: OsintReport, target?: CandidateProfile): Array<{ text: string; label: string; url?: string }> {
  const chunks: Array<{ text: string; label: string; url?: string }> = [];
  const targetUrls = target ? new Set(target.sourceUrls.map((u) => u.split("#")[0])) : null;

  const hits = report.searchHits.filter((h) => {
    if (!targetUrls) return h.classification !== "excluded";
    return targetUrls.has(h.url.split("#")[0]) || h.classification === "corroborated";
  });

  for (const h of hits.slice(0, 24)) {
    chunks.push({ text: `${h.title} ${h.snippet}`, label: hostOf(h.url), url: h.url });
  }

  for (const p of report.usernameProbes?.filter((x) => x.exists) || []) {
    if (target && !target.accounts.some((a) => a.url === p.url)) continue;
    chunks.push({
      text: `${p.displayName || ""} ${p.bio || ""} ${p.location || ""}`,
      label: `${p.platform} @${p.username}`,
      url: p.url,
    });
  }

  if (report.githubIntel) {
    const g = report.githubIntel;
    if (!target || target.accounts.some((a) => a.url === g.url)) {
      chunks.push({
        text: `${g.name || ""} ${g.bio || ""} ${g.location || ""} ${g.company || ""}`,
        label: "GitHub",
        url: g.url,
      });
    }
  }

  if (report.domainIntel?.siteDescription || report.domainIntel?.siteTitle) {
    chunks.push({
      text: `${report.domainIntel.siteTitle || ""} ${report.domainIntel.siteDescription || ""}`,
      label: report.domainIntel.domain,
      url: report.domainIntel.url,
    });
  }

  for (const cap of report.evidence.filter((e) => e.type === "page-capture").slice(0, 6)) {
    chunks.push({ text: cap.excerpt, label: cap.title, url: cap.url });
  }

  return chunks;
}

function curatePhotos(report: OsintReport, target?: CandidateProfile): DossierPhoto[] {
  const portraits = report.portraitIntel?.candidates || [];
  if (!portraits.length) return [];

  const allowedIds = target ? new Set(target.portraitIds) : null;
  const scored = (p: PortraitCandidate): number => {
    let s = 0;
    if (p.userAssignment === "subject" || p.role === "anchor") s += 50;
    if (p.userAssignment === "homonym" || p.userAssignment === "reject") return -100;
    if (p.matchVerdict === "matches-anchor") s += 40;
    else if (p.matchVerdict === "likely-same") s += 28;
    else if (p.matchVerdict === "distinct-person") s -= 30;
    if (p.similarityToAnchor != null) s += Math.round(p.similarityToAnchor * 20);
    if (p.role === "anchor") s += 15;
    if (p.platform === "gravatar" || p.platform === "github") s += 5;
    return s;
  };

  const pool = portraits
    .filter((p) => {
      if (allowedIds && !allowedIds.has(p.id) && p.role !== "anchor") return false;
      return scored(p) >= 0;
    })
    .sort((a, b) => scored(b) - scored(a));

  const picked: PortraitCandidate[] = [];
  const seenHash = new Set<string>();
  for (const p of pool) {
    if (picked.length >= 2) break;
    const key = p.dHash || p.id;
    if (seenHash.has(key)) continue;
    seenHash.add(key);
    picked.push(p);
  }

  return picked.map((p) => {
    let confidence: DossierPhoto["confidence"] = "possible";
    if (p.matchVerdict === "matches-anchor" || p.userAssignment === "subject") confidence = "confirmed";
    else if (p.matchVerdict === "likely-same") confidence = "likely";

    const tags: string[] = [];
    if (p.platform) tags.push(p.platform);
    if (p.matchVerdict === "matches-anchor") tags.push("matches anchor");
    if (p.similarityToAnchor != null && p.similarityToAnchor >= 0.85) tags.push("high visual match");

    return {
      id: p.id,
      imageUrl: p.imageUrl,
      dataUri: p.dataUri,
      label: p.label,
      platform: p.platform,
      profileUrl: p.profileUrl,
      caption: tags.length ? tags.join(" · ") : "Public profile image",
      confidence,
      localPath: p.localPath,
    };
  });
}

function buildSocialProfiles(report: OsintReport, target?: CandidateProfile): DossierSocialProfile[] {
  const probes = report.usernameProbes?.filter((p) => p.exists) || [];
  const scoredMap = new Map((report.scoredAccounts || []).map((s) => [s.url, s]));

  const all = probes
    .filter((p) => {
      if (!target) return true;
      return target.accounts.some((a) => a.url === p.url);
    })
    .map((p) => {
      const s = scoredMap.get(p.url);
      const tier = s?.tier || "discovered";
      const posterior = s ? Math.round(s.posterior * 100) : p.confidence;
      let verificationNote = `${p.method} probe`;
      if (s?.portraitVerdict === "matches-anchor") verificationNote += " · face matches anchor";
      else if (s?.portraitVerdict === "likely-same") verificationNote += " · likely same person (visual)";
      else if (s?.linkOwnership === "self-claimed") verificationNote += " · self-claimed on anchor site";
      else if (s?.tier === "attributed") verificationNote += " · log-odds attributed";
      else if (s?.tier === "quarantined") verificationNote += " · quarantined - verify manually";

      return {
        platform: p.platform,
        username: p.username,
        url: p.url,
        tier,
        posterior,
        displayName: p.displayName,
        bio: p.bio,
        location: p.location,
        verificationNote,
      };
    })
    .sort((a, b) => b.posterior - a.posterior);

  // v8: main dossier shows attributed/likely only; quarantine never floods client body
  const { main } = filterDossierSocialForClient(all);
  // If target locked, still prefer main; if empty and target set, allow discovered with content
  if (main.length) return main;
  return all.filter((p) => p.tier === "attributed" || (p.tier === "discovered" && (p.bio || p.displayName))).slice(0, 8);
}

function buildContacts(report: OsintReport, extracted: ReturnType<typeof mergeExtracted>, target?: CandidateProfile): DossierContact[] {
  const contacts: DossierContact[] = [];
  const { subject } = report;

  if (subject.email) {
    contacts.push({
      type: "email",
      value: subject.email,
      source: "Intake (investigator provided)",
      confidence: "confirmed",
    });
  }
  if (report.emailIntel?.email && report.emailIntel.email !== subject.email) {
    contacts.push({
      type: "email",
      value: report.emailIntel.email,
      source: "Email intelligence module",
      confidence: "confirmed",
    });
  }
  if (subject.phone) {
    contacts.push({
      type: "phone",
      value: subject.phone,
      source: "Intake (investigator provided)",
      confidence: "confirmed",
    });
  }
  if (subject.address) {
    contacts.push({
      type: "address",
      value: subject.address,
      source: "Intake (investigator provided)",
      confidence: "confirmed",
    });
  }
  if (report.addressIntel?.geocoded?.displayName) {
    contacts.push({
      type: "address",
      value: report.addressIntel.geocoded.displayName,
      source: "Geocoded from intake address",
      confidence: report.addressIntel.geocoded ? "likely" : "possible",
    });
  }

  for (const c of toContacts(extracted)) {
    if (contacts.some((x) => x.type === c.type && x.value.toLowerCase() === c.value.toLowerCase())) continue;
    contacts.push(c);
  }

  if (target) {
    for (const loc of target.locations) {
      if (!contacts.some((c) => c.type === "address" && c.value.includes(loc))) {
        contacts.push({
          type: "address",
          value: loc,
          source: `Confirmed TARGET profile: ${target.displayName.slice(0, 40)}`,
          confidence: "likely",
          sourceUrl: target.primaryUrl,
        });
      }
    }
  }

  return contacts;
}

function buildEmployment(
  report: OsintReport,
  extracted: ReturnType<typeof mergeExtracted>,
  target?: CandidateProfile,
  business?: BusinessResolution,
): DossierEmployment[] {
  const jobs: DossierEmployment[] = [];

  // v8: business fusion first (highest quality)
  if (business?.employmentForDossier.length) {
    for (const e of business.employmentForDossier) {
      const org = sanitizeOrganizationName(e.organization);
      if (!org) continue;
      jobs.push({ ...e, organization: org });
    }
  }

  if (report.subject.employer) {
    const org = sanitizeOrganizationName(report.subject.employer);
    if (org && !jobs.some((j) => j.organization.toLowerCase() === org.toLowerCase())) {
      jobs.push({
        organization: org,
        source: "Intake anchor",
        confidence: "confirmed",
      });
    }
  }
  if (report.githubIntel?.company) {
    const org = sanitizeOrganizationName(report.githubIntel.company);
    if (org && !jobs.some((j) => j.organization.toLowerCase() === org.toLowerCase())) {
      jobs.push({
        organization: org,
        role: report.githubIntel.bio || undefined,
        source: "GitHub profile",
        confidence: "likely",
        sourceUrl: report.githubIntel.url,
      });
    }
  }
  if (target) {
    for (const e of target.employment) {
      const org = sanitizeOrganizationName(e);
      if (!org) continue;
      if (!jobs.some((j) => j.organization.toLowerCase() === org.toLowerCase())) {
        jobs.push({
          organization: org,
          source: `TARGET profile: ${target.displayName.slice(0, 40)}`,
          confidence: "likely",
          sourceUrl: target.primaryUrl,
        });
      }
    }
  }
  for (const e of extracted.employment) {
    const org = sanitizeOrganizationName(e.organization);
    if (!org) continue;
    if (!jobs.some((j) => j.organization.toLowerCase() === org.toLowerCase())) {
      jobs.push({ ...e, organization: org });
    }
  }

  return jobs.slice(0, 8);
}

function buildNarrative(
  report: OsintReport,
  target: CandidateProfile | undefined,
  social: DossierSocialProfile[],
  employment: DossierEmployment[],
  photos: DossierPhoto[],
  relatives: SubjectDossier["relatives"],
): string {
  const name = fullName(report.subject) || "The subject";
  const parts: string[] = [];

  if (target) {
    parts.push(
      `${name} is assessed as matching the public profile "${target.displayName.slice(0, 100)}" (${target.likelihood}% likelihood, investigator-confirmed TARGET).`,
    );
  } else {
    parts.push(`${name} is documented from public-source OSINT with disambiguation score ${report.disambiguation.score}/100 (${report.disambiguation.homonymRisk} homonym risk).`);
  }

  const loc = locationLine(report.subject);
  if (loc) parts.push(`Intake location: ${loc}.`);
  else if (target?.locations.length) parts.push(`Associated locations include ${target.locations.slice(0, 2).join("; ")}.`);

  if (employment.length) {
    const primary = employment.find((e) => e.confidence === "confirmed") || employment[0];
    parts.push(`Professional association: ${primary!.organization}${primary!.role ? ` (${primary.role})` : ""} [${primary!.confidence}].`);
  }

  const attributed = social.filter((s) => s.tier === "attributed");
  const discovered = social.filter((s) => s.tier === "discovered");
  if (attributed.length) {
    parts.push(
      `Attributed public accounts: ${attributed.map((s) => `${s.platform} @${s.username}`).join(", ")}.`,
    );
  } else if (discovered.length) {
    parts.push(`Discovered public profiles on ${discovered.slice(0, 4).map((s) => s.platform).join(", ")} - verify before operational use.`);
  }

  if (photos.length) {
    parts.push(`${photos.length} curated public portrait(s) selected for visual identification (${photos.map((p) => p.confidence).join(", ")} confidence).`);
  }

  if (relatives.length) {
    const spouse = relatives.find((r) => r.relation === "spouse");
    const kids = relatives.filter((r) => r.relation === "child");
    if (spouse) parts.push(`Possible spouse/partner mentioned in public text: ${spouse.name} [${spouse.confidence} - verify].`);
    if (kids.length) parts.push(`Possible child name(s) in public text: ${kids.map((k) => k.name).join(", ")} [verify].`);
  }

  if (report.investigatorBrief?.assessment) {
    parts.push(report.investigatorBrief.assessment);
  }

  return parts.join(" ");
}

function identifyGaps(dossier: Omit<SubjectDossier, "gaps">): string[] {
  const gaps: string[] = [];
  if (!dossier.photos.length) gaps.push("No curated face photos - add anchor domain, Gravatar, or confirm portraits.");
  if (!dossier.contacts.some((c) => c.type === "email")) gaps.push("No email address on file.");
  if (!dossier.contacts.some((c) => c.type === "phone")) gaps.push("No phone number discovered.");
  if (!dossier.contacts.some((c) => c.type === "address")) gaps.push("No address - provide intake address or corroborated location.");
  if (!dossier.employment.length) gaps.push("No employment/organization corroborated.");
  if (!dossier.socialProfiles.filter((s) => s.tier === "attributed").length) {
    gaps.push("No attributed social accounts - strengthen with username + domain anchors.");
  }
  if (!dossier.relatives.some((r) => r.relation === "spouse")) gaps.push("Spouse/partner not found in public text (may not be published).");
  if (!dossier.relatives.some((r) => r.relation === "child")) gaps.push("Children not found in public text (may not be published).");
  return gaps;
}

export function buildSubjectDossier(
  report: OsintReport,
  priorNotes = "",
  extras?: { business?: BusinessResolution; timeline?: LifeTimeline },
): SubjectDossier {
  const target = targetProfile(report);
  const chunks = corpusTexts(report, target);
  const extracted = mergeExtracted(
    ...chunks.map((c) => extractFactsFromText(c.text, c.label, c.url)),
  );

  const photos = curatePhotos(report, target);
  const socialProfiles = buildSocialProfiles(report, target);
  const contacts = buildContacts(report, extracted, target);
  const employment = buildEmployment(report, extracted, target, extras?.business);
  const relatives = target
    ? [
        ...target.associates.map((a) => ({
          relation: "associate" as const,
          name: a,
          source: `TARGET profile`,
          confidence: "possible" as const,
          sourceUrl: target.primaryUrl,
        })),
        ...extracted.relatives,
      ].slice(0, 12)
    : extracted.relatives.slice(0, 12);

  const locations = [
    ...(locationLine(report.subject)
      ? [{ label: locationLine(report.subject), source: "Intake", confidence: "confirmed" as const }]
      : []),
    ...extracted.locations,
    ...(target?.locations.map((l) => ({
      label: l,
      source: "TARGET profile",
      confidence: "likely" as const,
      sourceUrl: target.primaryUrl,
    })) || []),
  ].slice(0, 8);

  // v8: prefer timeline-aware media; cap highlights; skip demoted homonym noise
  const mediaHighlights = [
    ...(report.mediaTimeline?.entries || []).slice(0, 8).map((e) => ({
      title: e.title,
      url: e.url,
      outlet: e.outlet,
      date: e.date,
      summary: e.snippet?.slice(0, 160),
    })),
    ...(target?.mediaMentions || [])
      .filter((m) => !report.mediaTimeline?.entries.some((e) => e.url === m.url))
      .slice(0, 4)
      .map((m) => ({
        title: m.title,
        url: m.url,
        outlet: m.outlet,
        date: m.date,
        summary: m.relevance,
      })),
  ]
    .filter((m) => !/stacey daprizio|jeff daprizio|diluzio/i.test(`${m.title} ${m.summary || ""}`))
    .slice(0, 10);

  let narrativeSummary = buildNarrative(report, target, socialProfiles, employment, photos, relatives);
  if (extras?.timeline?.narrativeArc) {
    narrativeSummary = `${extras.timeline.narrativeArc} ${narrativeSummary}`.slice(0, 1200);
  }

  const base: Omit<SubjectDossier, "gaps"> = {
    generatedAt: new Date().toISOString(),
    identityLocked: Boolean(target),
    targetLabel: target?.displayName,
    confidenceTier: report.investigatorBrief?.confidenceTier || "insufficient",
    narrativeSummary,
    photos,
    contacts,
    employment,
    relatives,
    socialProfiles,
    locations,
    mediaHighlights,
    investigatorNotes: priorNotes || report.dossier?.investigatorNotes || "",
    disclaimer:
      "Public sources only. Investigative lead - not legal proof of identity. Spouse/children/contacts extracted from public text require independent verification before operational use.",
  };

  const gaps = identifyGaps(base);
  if (extras?.timeline?.openQuestions.length) {
    for (const q of extras.timeline.openQuestions) {
      if (!gaps.includes(q)) gaps.push(q);
    }
  }

  return { ...base, gaps: gaps.slice(0, 12) };
}