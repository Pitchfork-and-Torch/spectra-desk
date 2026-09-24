import type { LegalContact } from "../types.js";

const PLATFORM_LEGAL: Record<string, Omit<LegalContact, "platform">> = {
  GitHub: {
    policyUrl: "https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement",
    lawEnforcementUrl: "https://docs.github.com/en/site-policy/other-site-policies/guidelines-for-legal-requests-of-user-data",
    notes: "Subpoena / preservation requests via legal@github.com",
  },
  Reddit: {
    policyUrl: "https://www.reddit.com/policies/privacy-policy",
    lawEnforcementUrl: "https://www.reddit.com/wiki/lawenforcement",
    notes: "Legal process to legal@reddit.com",
  },
  Twitter: {
    policyUrl: "https://twitter.com/en/privacy",
    lawEnforcementUrl: "https://help.twitter.com/en/rules-and-policies/twitter-law-enforcement-support",
    notes: "X Corp law enforcement portal",
  },
  "Twitter/X": {
    policyUrl: "https://twitter.com/en/privacy",
    lawEnforcementUrl: "https://help.twitter.com/en/rules-and-policies/twitter-law-enforcement-support",
    notes: "X Corp law enforcement portal",
  },
  Instagram: {
    policyUrl: "https://privacycenter.instagram.com/policy",
    lawEnforcementUrl: "https://about.meta.com/actions/protecting-privacy-and-security/law-enforcement/",
    notes: "Meta law enforcement requests",
  },
  Facebook: {
    policyUrl: "https://www.facebook.com/privacy/policy",
    lawEnforcementUrl: "https://about.meta.com/actions/protecting-privacy-and-security/law-enforcement/",
    notes: "Meta law enforcement requests",
  },
  LinkedIn: {
    policyUrl: "https://www.linkedin.com/legal/privacy-policy",
    lawEnforcementUrl: "https://www.linkedin.com/legal/law-enforcement",
    notes: "LinkedIn legal process guide",
  },
  YouTube: {
    policyUrl: "https://policies.google.com/privacy",
    lawEnforcementUrl: "https://support.google.com/legal/answer/10008194",
    notes: "Google legal process for YouTube",
  },
  Twitch: {
    policyUrl: "https://www.twitch.tv/p/en/legal/privacy-notice/",
    lawEnforcementUrl: "https://legal.twitch.com/en/legal/law-enforcement-guidelines/",
    notes: "Amazon/Twitch law enforcement guidelines",
  },
  Discord: {
    policyUrl: "https://discord.com/privacy",
    lawEnforcementUrl: "https://discord.com/safety-law-enforcement",
    notes: "Discord law enforcement portal",
  },
  Steam: {
    policyUrl: "https://store.steampowered.com/privacy_agreement/",
    lawEnforcementUrl: "https://partner.steamgames.com/doc/legal",
    notes: "Valve - legal requests via published counsel contacts",
  },
  Bandcamp: {
    policyUrl: "https://bandcamp.com/terms_of_use",
    lawEnforcementUrl: "https://bandcamp.com/terms_of_use",
    notes: "Contact Bandcamp legal for subscriber data requests",
  },
};

export function legalContactsForPlatforms(platforms: string[]): LegalContact[] {
  const seen = new Set<string>();
  const out: LegalContact[] = [];
  for (const platform of platforms) {
    const key = platform in PLATFORM_LEGAL ? platform : Object.keys(PLATFORM_LEGAL).find((k) => platform.includes(k));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const entry = PLATFORM_LEGAL[key];
    if (entry) out.push({ platform: key, ...entry });
  }
  return out;
}