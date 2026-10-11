import type { SubjectInput } from "../types.js";
import { nameMatchesInText } from "./name-variants.js";
import { locationLine } from "./subject.js";

const PROFESSIONAL_PLATFORMS = /linkedin\.com\/in\/|linkedin\.com\/pub\/|crunchbase\.com\/person/i;
const LOCAL_INTERVIEW = /voyagetampa\.com\/interview|\/interview\/meet-|local.*interview/i;
const DEV_PLATFORMS = /github\.com\/(?!organizations|orgs|settings)/i;
const GITHUB_RESERVED = /github\.com\/(login|signup|features|topics|collections|explore|search)/i;

export function isLinkedInProfileUrl(url: string): boolean {
  return /linkedin\.com\/in\/[^/?#]+/i.test(url) || /linkedin\.com\/pub\/[^/?#]+/i.test(url);
}

export function isGitHubProfileUrl(url: string): boolean {
  if (GITHUB_RESERVED.test(url)) return false;
  return /github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/i.test(url);
}

export function locationMatchesText(text: string, subject: SubjectInput): boolean {
  const blob = text.toLowerCase();
  const parts = [subject.city, subject.state, subject.country].filter(Boolean).map((p) => p!.toLowerCase());
  if (!parts.length) return false;
  if (parts.every((p) => blob.includes(p))) return true;
  if (subject.city && blob.includes(subject.city.toLowerCase())) {
    if (subject.state) return blob.includes(subject.state.toLowerCase()) || /\bflorida\b|\btampa\b/i.test(blob);
    return true;
  }
  const loc = locationLine(subject).toLowerCase();
  if (loc.length > 3 && blob.includes(loc)) return true;
  return false;
}

export function platformRelevanceBoost(
  hit: { title: string; snippet: string; url: string },
  subject: SubjectInput,
): { boost: number; signals: string[] } {
  const text = `${hit.title} ${hit.snippet}`;
  const signals: string[] = [];
  let boost = 0;
  const nameMatch = nameMatchesInText(subject.firstName, subject.lastName, text);

  if (/linkedin\.com\/pub\/dir/i.test(hit.url)) {
    boost += 14;
    signals.push("LinkedIn directory pivot");
    if (nameMatch >= 0.7 && locationMatchesText(text, subject)) {
      boost += 16;
      signals.push(`location:${locationLine(subject)}`);
    }
  } else if (isLinkedInProfileUrl(hit.url)) {
    boost += 22;
    signals.push("LinkedIn profile URL");
    if (nameMatch >= 0.7) {
      boost += 12;
      signals.push("Name match on LinkedIn hit");
    }
    if (locationMatchesText(text, subject)) {
      boost += 18;
      signals.push(`location:${locationLine(subject)}`);
    }
    if (subject.employer && text.toLowerCase().includes(subject.employer.toLowerCase())) {
      boost += 10;
      signals.push(`Mentions ${subject.employer}`);
    }
  } else if (DEV_PLATFORMS.test(hit.url) && isGitHubProfileUrl(hit.url)) {
    if (nameMatch >= 0.85) {
      boost += 10;
      signals.push("GitHub with strong name match");
    } else if (nameMatch < 0.55) {
      boost -= 18;
      signals.push("GitHub username hit without name corroboration");
    } else {
      boost -= 8;
    }
  } else if (LOCAL_INTERVIEW.test(hit.url) || LOCAL_INTERVIEW.test(text)) {
    boost += 20;
    signals.push("Local professional interview");
    if (nameMatch >= 0.7) boost += 10;
    if (locationMatchesText(text, subject)) {
      boost += 14;
      signals.push(`location:${locationLine(subject)}`);
    }
  } else if (PROFESSIONAL_PLATFORMS.test(hit.url)) {
    boost += 8;
  }

  return { boost, signals };
}

export function githubProbeMatchesSubject(
  probe: { displayName?: string; bio?: string; location?: string; method: string },
  subject: SubjectInput,
): boolean {
  const blob = `${probe.displayName || ""} ${probe.bio || ""} ${probe.location || ""}`;
  const nameMatch = nameMatchesInText(subject.firstName, subject.lastName, blob);
  if (nameMatch >= 0.75) return true;
  if (probe.location && locationMatchesText(probe.location, subject)) return true;
  if (probe.method === "api" && nameMatch >= 0.55 && locationMatchesText(blob, subject)) return true;
  return false;
}