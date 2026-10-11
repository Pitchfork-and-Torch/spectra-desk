import type { SubjectInput } from "../types.js";
import { deriveUsernames, fullName } from "./subject.js";

export interface SubjectAnchors {
  names: string[];
  usernames: string[];
  domains: string[];
  emails: string[];
  locations: string[];
  keywords: string[];
}

export function extractAnchors(subject: SubjectInput): SubjectAnchors {
  const names = new Set<string>();
  const name = fullName(subject);
  if (name) names.add(name.toLowerCase());
  if (subject.firstName && subject.lastName) {
    names.add(`${subject.firstName} ${subject.lastName}`.toLowerCase());
  }

  const usernames = deriveUsernames(subject).map((u) => u.toLowerCase());
  const domains = new Set<string>();
  const emails: string[] = [];

  if (subject.email) emails.push(subject.email.toLowerCase());

  for (const field of [subject.employer, subject.website, subject.notes]) {
    if (!field) continue;
    for (const m of field.matchAll(/site:\s*([a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,})/gi)) {
      domains.add(m[1].toLowerCase());
    }
    const domainMatch = field.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][-a-z0-9]*\.[a-z]{2,})/gi);
    domainMatch?.forEach((d) => {
      const cleaned = d.replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase();
      if (!cleaned.startsWith("site:")) domains.add(cleaned);
    });
    if (field.includes(".") && !field.includes(" ") && field.length < 40 && !field.includes(":")) {
      domains.add(field.replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase());
    }
  }

  const locations = [subject.city, subject.state, subject.country].filter(Boolean).map((l) => l!.toLowerCase());

  const keywords = new Set<string>();
  if (subject.notes) {
    for (const word of subject.notes.split(/[\s,;.]+/)) {
      if (word.length >= 4 && !/^(and|the|with|from|site|http)$/i.test(word)) keywords.add(word.toLowerCase());
    }
  }
  if (subject.employer && !subject.employer.includes(".")) keywords.add(subject.employer.toLowerCase());

  return {
    names: [...names],
    usernames,
    domains: [...domains],
    emails,
    locations,
    keywords: [...keywords],
  };
}

export function anchorMatchScore(text: string, url: string, anchors: SubjectAnchors): { score: number; signals: string[] } {
  const blob = `${text} ${url}`.toLowerCase();
  let score = 0;
  const signals: string[] = [];

  for (const u of anchors.usernames) {
    if (blob.includes(u) || url.toLowerCase().includes(u)) {
      score += 35;
      signals.push(`username:${u}`);
      break;
    }
  }

  for (const d of anchors.domains) {
    if (blob.includes(d) || url.toLowerCase().includes(d)) {
      score += 30;
      signals.push(`domain:${d}`);
      break;
    }
  }

  for (const e of anchors.emails) {
    if (blob.includes(e)) {
      score += 40;
      signals.push(`email:${e}`);
    }
  }

  for (const loc of anchors.locations) {
    if (blob.includes(loc)) {
      score += 12;
      signals.push(`location:${loc}`);
    }
  }

  for (const kw of anchors.keywords) {
    if (blob.includes(kw)) {
      score += 8;
      signals.push(`keyword:${kw}`);
    }
  }

  return { score: Math.min(50, score), signals };
}

export function hasMinimumAnchors(subject: SubjectInput): {
  hasUsername: boolean;
  hasEmail: boolean;
  hasDomain: boolean;
  sufficientForCommonName: boolean;
} {
  const anchors = extractAnchors(subject);
  const hasUsername = Boolean(subject.username || anchors.usernames.length > 0);
  const hasEmail = Boolean(subject.email);
  const hasDomain = anchors.domains.length > 0;
  const anchorCount = [hasUsername, hasEmail, hasDomain].filter(Boolean).length;
  return {
    hasUsername,
    hasEmail,
    hasDomain,
    sufficientForCommonName: anchorCount >= 2 || (hasEmail && hasUsername) || (hasDomain && hasUsername),
  };
}