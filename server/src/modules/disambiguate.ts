import type {
  DisambiguationAnswer,
  DisambiguationProfile,
  DisambiguationQuestion,
  IdentityCandidate,
  ScoreComponent,
  SearchHit,
  SocialCandidate,
  SubjectInput,
  WikipediaResult,
} from "../types.js";
import { extractAnchors, hasMinimumAnchors } from "./anchors.js";
import { isCommonName } from "./homonym-filter.js";
import { buildScoreBreakdown } from "./score-breakdown.js";
import { fuseSignals } from "./signal-fusion.js";
import { loadNegativeSignals } from "./negative-signals.js";
import { fullName, locationLine } from "./subject.js";
import { nameMatchesInText } from "./name-variants.js";
import { isGitHubProfileUrl, isLinkedInProfileUrl, locationMatchesText, platformRelevanceBoost } from "./platform-scoring.js";

function extractCandidates(
  hits: SearchHit[],
  subject: SubjectInput,
  wiki: WikipediaResult[],
  social: SocialCandidate[] = [],
): IdentityCandidate[] {
  const candidates: IdentityCandidate[] = [];
  const seen = new Set<string>();
  const anchors = extractAnchors(subject);

  for (const s of social.filter((x) => x.platform === "LinkedIn" && x.confidence >= 78)) {
    const key = s.url.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    const platform = platformRelevanceBoost({ title: s.platform, snippet: "", url: s.url }, subject);
    candidates.push({
      id: `social-${candidates.length}`,
      label: `LinkedIn profile (${s.method})`,
      sourceUrl: s.url,
      snippet: `Discovered via ${s.method} - confidence ${s.confidence}%`,
      signals: ["LinkedIn social candidate", ...platform.signals],
      matchScore: Math.min(100, 70 + Math.round(s.confidence * 0.25) + platform.boost * 0.5),
    });
  }

  const prioritized = [
    ...hits.filter((h) => h.classification === "corroborated"),
    ...hits.filter((h) => h.classification === "possible"),
    ...hits.filter((h) => !h.classification),
  ];

  for (const h of prioritized) {
    if (candidates.length >= 8) break;
    const key = h.url.split("#")[0];
    if (seen.has(key)) continue;
    const match = nameMatchesInText(subject.firstName, subject.lastName, `${h.title} ${h.snippet}`);
    if (match < 0.5 && h.classification !== "corroborated") continue;
    seen.add(key);

    const signals = [...(h.anchorSignals || [])];
    if (subject.employer && `${h.title} ${h.snippet}`.toLowerCase().includes(subject.employer.toLowerCase())) {
      signals.push(`Mentions ${subject.employer}`);
    }

    let matchScore = Math.round(match * 60) + (h.relevanceScore || 0) * 0.4;
    if (h.classification === "corroborated") matchScore += 25;
    if (h.classification === "excluded") matchScore = Math.min(matchScore, 20);

    const platform = platformRelevanceBoost(h, subject);
    matchScore += platform.boost * 0.6;
    signals.push(...platform.signals);

    if (isGitHubProfileUrl(h.url) && match < 0.75 && h.classification !== "corroborated") {
      matchScore = Math.min(matchScore, 35);
      signals.push("GitHub hit deprioritized - weak name match");
    }
    // LinkedIn directory pivots are actionable when profile /in/ URLs are blocked by search engines
    if (/linkedin\.com\/pub\/dir/i.test(h.url) && subject.firstName && subject.lastName) {
      matchScore += 28;
      signals.push("LinkedIn directory pivot");
      if (locationMatchesText(`${h.title} ${h.snippet}`, subject)) {
        matchScore += 10;
        signals.push(`location:${locationLine(subject)}`);
      }
    }
    if (isLinkedInProfileUrl(h.url)) {
      matchScore += 12;
      if (locationMatchesText(`${h.title} ${h.snippet}`, subject)) {
        matchScore += 15;
        signals.push(`location:${locationLine(subject)}`);
      }
    }

    candidates.push({
      id: `hit-${candidates.length}`,
      label: h.title,
      sourceUrl: h.url,
      snippet: h.snippet || h.title,
      signals,
      matchScore: Math.min(100, Math.round(matchScore)),
    });
  }

  for (const w of wiki.slice(0, 2)) {
    const key = w.url;
    if (seen.has(key)) continue;
    const anchorInWiki = anchors.domains.some((d) => w.description.toLowerCase().includes(d))
      || anchors.keywords.some((k) => w.description.toLowerCase().includes(k));
    if (!anchorInWiki && isCommonName(subject.firstName, subject.lastName)) continue;
    seen.add(key);
    candidates.push({
      id: `wiki-${candidates.length}`,
      label: `${w.title} - ${w.description || "Wikipedia entry"}`,
      sourceUrl: w.url,
      snippet: w.description,
      signals: anchorInWiki ? ["Wikipedia", "anchor-match"] : ["Wikipedia"],
      matchScore: nameMatchesInText(subject.firstName, subject.lastName, `${w.title} ${w.description}`) * 100,
    });
  }

  return candidates
    .filter((c) => {
      if (!isGitHubProfileUrl(c.sourceUrl)) return true;
      const match = nameMatchesInText(subject.firstName, subject.lastName, `${c.label} ${c.snippet}`);
      return match >= 0.7 || c.signals.some((s) => s.startsWith("location:") || s.includes("corroborat"));
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6);
}

export function buildDisambiguationQuestions(
  subject: SubjectInput,
  candidates: IdentityCandidate[],
  score: number,
): DisambiguationQuestion[] {
  const questions: DisambiguationQuestion[] = [];

  if (candidates.length >= 2 && score < 85) {
    questions.push({
      id: "pick-candidate",
      type: "pick-candidate",
      question: `Multiple public profiles match "${fullName(subject)}". Which is your subject?`,
      required: false,
      options: [
        ...candidates.slice(0, 4).map((c) => ({
          id: c.id,
          label: c.label.slice(0, 120),
          value: c.id,
        })),
        { id: "none", label: "None of these - keep searching", value: "none" },
      ],
      hint: "Selecting a candidate boosts disambiguation score and focuses the report.",
    });
  }

  if (!subject.employer && candidates.some((c) => c.signals.some((s) => s.startsWith("Mentions")))) {
    const employerGuess = candidates.flatMap((c) => c.signals).find((s) => s.startsWith("Mentions "));
    if (employerGuess) {
      const emp = employerGuess.replace("Mentions ", "");
      questions.push({
        id: "confirm-employer",
        type: "confirm-employer",
        question: `Is your subject associated with "${emp}"?`,
        required: false,
        options: [
          { id: "yes", label: "Yes", value: emp },
          { id: "no", label: "No", value: "" },
          { id: "skip", label: "Skip", value: "" },
        ],
      });
    }
  }

  if (!subject.city && subject.lastName) {
    const locCandidate = candidates.find((c) => c.signals.some((s) => s.startsWith("location:")));
    if (locCandidate) {
      const citySignal = locCandidate.signals.find((s) => s.startsWith("location:"));
      if (citySignal) {
        questions.push({
          id: "confirm-location",
          type: "confirm-location",
          question: `Is your subject associated with ${citySignal.replace("location:", "")}?`,
          required: false,
          options: [
            { id: "yes", label: "Yes", value: citySignal.replace("location:", "") },
            { id: "no", label: "No", value: "" },
            { id: "skip", label: "Skip", value: "" },
          ],
        });
      }
    }
  }

  if (score < 60 && !subject.email) {
    questions.push({
      id: "has-email",
      type: "yes-no",
      question: "Do you have an email address for this subject? (Adding it dramatically improves accuracy)",
      required: false,
      options: [
        { id: "yes", label: "I can provide email - let me refine", value: "needs-email" },
        { id: "no", label: "No email available", value: "no-email" },
      ],
    });
  }

  if (isCommonName(subject.firstName, subject.lastName) && !hasMinimumAnchors(subject).sufficientForCommonName) {
    questions.unshift({
      id: "require-anchors",
      type: "yes-no",
      question: "Common name detected. Provide username AND (email or domain) before attribution?",
      required: true,
      options: [
        { id: "add", label: "I will add anchors and refine", value: "needs-anchors" },
        { id: "proceed", label: "Proceed with caution (investigative lead only)", value: "proceed-uncertain" },
      ],
      hint: "Without anchors, homonym collision is likely.",
    });
  }

  return questions;
}

export function disambiguate(
  subject: SubjectInput,
  hits: SearchHit[],
  socialVerified: number,
  wiki: WikipediaResult[] = [],
  answers?: DisambiguationAnswer[],
  excludedCount = 0,
  fusionContext?: { github?: import("../types.js").GitHubIntel; domain?: import("../types.js").DomainIntel },
  socialCandidates: SocialCandidate[] = [],
): DisambiguationProfile {
  const rationale: string[] = [];
  const signals: string[] = [];
  const components: ScoreComponent[] = [];
  const anchors = extractAnchors(subject);

  const name = fullName(subject);
  const loc = locationLine(subject);
  const corroborated = hits.filter((h) => h.classification === "corroborated");

  const add = (id: string, label: string, delta: number, category: ScoreComponent["category"], rationaleLine?: string) => {
    if (delta === 0) return;
    components.push({ id, label, delta, category });
    if (rationaleLine) rationale.push(rationaleLine);
  };

  if (name) {
    add("name", "Full name provided", 8, "anchor", `Full name: ${name}`);
  }
  if (subject.email) {
    add("email", "Email anchor", 22, "anchor", "Email anchor (+22)");
    signals.push(`Email: ${subject.email}`);
  }
  if (loc) {
    add("location", "Location signal", 12, "anchor");
    signals.push(`Location: ${loc}`);
  }
  if (subject.employer) {
    add("employer", "Employer/site anchor", 10, "anchor");
    signals.push(`Employer: ${subject.employer}`);
  }
  if (subject.phone) add("phone", "Phone provided", 8, "anchor");
  if (subject.username) {
    add("username", "Username anchor", 10, "anchor");
    signals.push(`Username: ${subject.username}`);
  }

  if (corroborated.length >= 2) {
    add("corroborated-multi", `${corroborated.length} anchor-corroborated hits`, 22, "corroboration", `${corroborated.length} anchor-corroborated hits`);
  } else if (corroborated.length === 1) {
    add("corroborated-one", "1 anchor-corroborated hit", 12, "corroboration", "1 anchor-corroborated hit");
  }

  const alignedHits = hits.filter((h) => nameMatchesInText(subject.firstName, subject.lastName, `${h.title} ${h.snippet}`) >= 0.85);
  if (alignedHits.length >= 3 && corroborated.length === 0) {
    add("name-aligned", `${alignedHits.length} name-aligned hits (no anchor lock)`, 8, "corroboration", `${alignedHits.length} name-aligned hits (no anchor lock)`);
  }

  // Successful noise filtering is a positive disambiguation signal (not a score penalty).
  // Heavy penalties only apply when the subject is a common name and noise still dominates.
  if (excludedCount >= 2 && !isCommonName(subject.firstName, subject.lastName)) {
    add(
      "noise-filtered",
      `${excludedCount} noise hits filtered`,
      Math.min(12, 4 + excludedCount * 2),
      "corroboration",
      `${excludedCount} first-name/entertainment collisions filtered`,
    );
  } else if (excludedCount >= 3 && isCommonName(subject.firstName, subject.lastName)) {
    add("homonym-excluded", `${excludedCount} homonym hits excluded`, -10, "penalty", `${excludedCount} homonym hits excluded`);
  }

  if (!isCommonName(subject.firstName, subject.lastName) && (subject.lastName?.length || 0) >= 5) {
    add("uncommon-surname", "Uncommon surname", 8, "anchor", "Uncommon surname reduces collision risk");
  }

  const hasLinkedInPivot = hits.some(
    (h) => isLinkedInProfileUrl(h.url) || /linkedin\.com\/pub\/dir/i.test(h.url),
  );
  if (hasLinkedInPivot && loc) {
    add("linkedin-pivot", "LinkedIn professional pivot present", 10, "corroboration", "LinkedIn professional pivot available for confirmation");
  }

  if (isCommonName(subject.firstName, subject.lastName) && corroborated.length < 2) {
    add("common-name", "Common name without anchor corroboration", -12, "penalty", "Common name - requires anchor corroboration");
  }

  const wikiMatch = wiki.find((w) => {
    const nameOk = nameMatchesInText(subject.firstName, subject.lastName, w.title) >= 0.85;
    const anchorOk = anchors.domains.some((d) => w.description.toLowerCase().includes(d));
    return nameOk && (anchorOk || !isCommonName(subject.firstName, subject.lastName));
  });
  if (wikiMatch) {
    add("wikipedia", `Wikipedia: ${wikiMatch.title}`, 8, "wiki", `Wikipedia match (anchor-checked): ${wikiMatch.title}`);
  }

  if (socialVerified >= 2) {
    add("social-multi", `${socialVerified} verified profiles`, 12, "social", `${socialVerified} verified public profiles`);
  } else if (socialVerified === 1) {
    add("social-one", "1 verified profile", 6, "social");
  }

  const employerToken = subject.employer?.toLowerCase();
  const employerInHits = employerToken
    ? corroborated.some((h) => `${h.title} ${h.snippet} ${h.url}`.toLowerCase().includes(employerToken.replace(/^www\./, "")))
    : false;
  if (employerInHits) {
    add("employer-corpus", `Employer "${subject.employer}" in corpus`, 16, "corroboration", `Employer/site "${subject.employer}" corroborated in search results`);
  }

  const fusion = fuseSignals(subject, hits, fusionContext?.github, fusionContext?.domain);
  for (const b of fusion.boosts) {
    add(b.id, b.label, b.delta, "corroboration");
  }
  if (fusion.fusedFacts.length) {
    signals.push(...fusion.fusedFacts.slice(0, 3).map((f) => `Fusion: ${f.slice(0, 50)}`));
  }

  const negatives = loadNegativeSignals(subject.firstName, subject.lastName);
  if (negatives.length) {
    add("negative-signals", `${negatives.length} user-marked wrong identities on file`, -Math.min(15, negatives.length * 3), "penalty", `${negatives.length} excluded identities persisted locally`);
  }

  let candidates = extractCandidates(hits, subject, wiki, socialCandidates);
  const negUrls = new Set(negatives.map((n) => n.url));
  candidates = candidates.filter((c) => !negUrls.has(c.sourceUrl.split("#")[0]));

  if (answers?.length) {
    for (const ans of answers) {
      if (ans.questionId === "pick-candidate" && ans.value && ans.value !== "none") {
        const picked = candidates.find((c) => c.id === ans.value);
        if (picked) {
          add("user-candidate", "User confirmed candidate", 15, "user", `User confirmed candidate: ${picked.label.slice(0, 60)}`);
          signals.push(`Confirmed: ${picked.label.slice(0, 40)}`);
        }
      }
      if (ans.questionId === "confirm-employer" && ans.value) {
        add("user-employer", "User confirmed employer", 12, "user", `User confirmed employer: ${ans.value}`);
        (subject as SubjectInput).employer = ans.value;
      }
      if (ans.questionId === "confirm-location" && ans.value) {
        add("user-location", "User confirmed location", 10, "user", `User confirmed location signal: ${ans.value}`);
      }
    }
  }

  const breakdown = buildScoreBreakdown(components);
  let score = breakdown.finalScore;

  let homonymRisk: DisambiguationProfile["homonymRisk"] = "low";
  if (isCommonName(subject.firstName, subject.lastName) || excludedCount >= 4) homonymRisk = "high";
  else if (candidates.length >= 2 && corroborated.length < 2) homonymRisk = "medium";
  else if (excludedCount >= 2) homonymRisk = "medium";

  let label: string;
  if (homonymRisk === "high" && corroborated.length < 2) {
    label =
      socialVerified >= 2
        ? "Homonym risk - use API-verified accounts and anchors only"
        : "Common name - require anchor corroboration before attribution";
  } else if (corroborated.length >= 2 && score >= 70) label = "Anchor-corroborated - suitable for investigative lead";
  else if (score >= 75 && homonymRisk === "low") label = "High confidence - subject likely unique";
  else if (score >= 50) label = "Moderate - verify anchor-linked profiles";
  else label = "Low - do not attribute without additional corroboration";

  const questions = buildDisambiguationQuestions(subject, candidates, score);

  return {
    score,
    label,
    rationale,
    distinguishingSignals: signals,
    homonymRisk,
    candidates,
    questions,
    userAnswers: answers,
    refined: Boolean(answers?.length),
    scoreBreakdown: breakdown,
  };
}