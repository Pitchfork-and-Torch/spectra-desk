/**
 * Resolve Toolkit operator URL packs from subject intake or free indicators (v7).
 */
import type { SubjectInput } from "../types.js";
import { fullName, locationLine } from "./subject.js";
import { classifyIndicator, type ClassifiedIndicator, type IndicatorKind } from "./indicator-classify.js";
import {
  getToolkitTool,
  listToolkitTools,
  resolveToolkitUrl,
  type ToolkitTool,
} from "./toolkit-catalog.js";

export interface ResolvedToolkitLink {
  toolId: string;
  category: string;
  categoryLabel: string;
  group: string;
  label: string;
  url: string;
  missing: string[];
  ready: boolean;
}

export interface ToolkitOperatorPack {
  generatedAt: string;
  indicatorSummary: Array<{ kind: IndicatorKind; value: string; confidence: number }>;
  linkCount: number;
  readyCount: number;
  byCategory: Record<string, ResolvedToolkitLink[]>;
  links: ResolvedToolkitLink[];
  attribution: string;
}

const PRIORITY_PER_KIND: Record<string, string[]> = {
  email: [
    "email-hunter",
    "email-epieos",
    "email-intelx",
    "email-haveibeenpwned",
    "email-dehashed",
    "email-google",
    "email-bing",
    "usernames-whatsmyname",
  ],
  domain: [
    "domains-dns-whois",
    "domains-dns-crtsh",
    "domains-sec-virustotal",
    "domains-profile-builtwith",
    "domains-archive-archiveorg",
    "domains-sec-securitytrails",
    "domains-search-google",
    "domains-dns-dnsdump",
  ],
  username: [
    "usernames-whatsmyname",
    "usernames-namechk",
    "usernames-sherlock",
    "usernames-idcrawl",
    "x-search-twitter",
    "instagram-search-user",
    "keybase-profile",
  ],
  phone: [
    "phoneus-truepeoplesearch",
    "phoneus-fastpeoplesearch",
    "phoneint-truecaller",
    "phoneint-google",
    "phoneus-google",
  ],
  name: [
    "names-google",
    "names-bing",
    "names-linkedin",
    "names-truepeoplesearch",
    "names-fastpeoplesearch",
    "names-whitepages",
    "linkedin-search-people",
    "publiccompanyrecords-opencorporates",
  ],
  ip: [
    "ip-censys",
    "ip-shodan",
    "ip-virustotal",
    "ip-abuseipdb",
    "ip-ipinfo",
  ],
  iban: ["iban-search-google", "iban-search-bing", "iban-search-ibancalc"],
  btc: ["currencies-blockchain-btc", "currencies-wallet-explorer"],
  eth: ["currencies-etherscan"],
  vin: ["vehicles-vincheck", "vehicles-google"],
  url: ["domains-search-google", "domains-sec-urlscan-general"],
  unknown: ["searchengines-google", "searchengines-duckduckgo", "searchengines-yandex"],
};

function humanLabel(tool: ToolkitTool): string {
  const rest = tool.id.replace(`${tool.category}-`, "").replace(/-/g, " ");
  return rest.replace(/\b\w/g, (c) => c.toUpperCase());
}

function mergeParams(
  subject: SubjectInput | undefined,
  classified: ClassifiedIndicator[],
): Record<string, string> {
  const params: Record<string, string> = {};
  if (subject) {
    const name = fullName(subject);
    const loc = locationLine(subject);
    if (subject.firstName) {
      params.first = subject.firstName;
      params.firstname = subject.firstName;
    }
    if (subject.lastName) {
      params.last = subject.lastName;
      params.lastname = subject.lastName;
    }
    if (name) {
      params.full = name;
      params.fullname = name;
      params.realname = name;
      params.term = name;
      params.query = `"${name}"`;
      params.fullnamedash = name.replace(/\s+/g, "-");
      params.fullnamedashlower = name.replace(/\s+/g, "-").toLowerCase();
      params.full_dash = params.fullnamedash;
    }
    if (loc) params.location = loc;
    if (subject.city) params.city = subject.city;
    if (subject.state) params.state = subject.state;
    if (subject.country) {
      params.country = subject.country;
      params.country_iso_lower = subject.country.toLowerCase().slice(0, 2);
    }
    if (subject.email) {
      params.email = subject.email;
      params.localpart = subject.email.split("@")[0] || "";
      const ed = subject.email.split("@")[1];
      if (ed && !params.domain) params.domain = ed;
    }
    if (subject.phone) {
      const digs = subject.phone.replace(/\D/g, "");
      params.phone = subject.phone;
      params.e164 = subject.phone.startsWith("+") ? `+${digs}` : digs;
      params.number = digs;
      params.dt_num_only = digs;
      params.nat_num = digs;
    }
    if (subject.username) {
      params.username = subject.username;
      params.usera = subject.username;
    }
    if (subject.website) {
      try {
        const host = new URL(
          subject.website.startsWith("http") ? subject.website : `https://${subject.website}`,
        ).hostname.replace(/^www\./, "");
        params.domain = host;
        params.domain_nodots = host.replace(/\./g, "");
        params.url = subject.website.startsWith("http")
          ? subject.website
          : `https://${subject.website}`;
      } catch {
        params.domain = subject.website;
      }
    }
    if (subject.address) {
      params.street = subject.address;
      params.full_address = [subject.address, subject.city, subject.state].filter(Boolean).join(", ");
      params.usa_address_query = params.full_address;
    }
    if (subject.employer) {
      params.company = subject.employer;
      params.companyname = subject.employer;
      params.officername = name || subject.employer;
    }
  }
  for (const c of classified) {
    Object.assign(params, c.params);
  }
  // Generic fallbacks
  if (!params.term && params.fullname) params.term = params.fullname;
  if (!params.query && params.term) params.query = params.term;
  if (!params.keyword && params.term) params.keyword = params.term;
  return params;
}

function pickToolsForKind(kind: IndicatorKind, limit: number): ToolkitTool[] {
  const priorityIds = PRIORITY_PER_KIND[kind] || PRIORITY_PER_KIND.unknown;
  const picked: ToolkitTool[] = [];
  const seen = new Set<string>();

  for (const id of priorityIds) {
    const t = getToolkitTool(id);
    if (t && !seen.has(t.id)) {
      picked.push(t);
      seen.add(t.id);
    }
  }

  // Fill from category if priority IDs missing (catalog naming may differ)
  const classified = { kind } as ClassifiedIndicator;
  const cats =
    kind === "phone"
      ? ["phoneus", "phoneint"]
      : kind === "name"
        ? ["names", "linkedin", "searchengines"]
        : kind === "username"
          ? ["usernames", "x", "instagram", "facebook", "keybase"]
          : kind === "domain"
            ? ["domains"]
            : kind === "email"
              ? ["email"]
              : kind === "ip"
                ? ["ip"]
                : kind === "iban"
                  ? ["iban"]
                  : kind === "btc" || kind === "eth"
                    ? ["currencies"]
                    : kind === "vin"
                      ? ["vehicles"]
                      : ["searchengines"];

  for (const cat of cats) {
    for (const t of listToolkitTools({ category: cat, limit: 40 })) {
      if (seen.has(t.id)) continue;
      // Prefer tools with matching primary placeholder
      const wants =
        kind === "email"
          ? t.placeholders.includes("email") || t.placeholders.includes("term")
          : kind === "domain"
            ? t.placeholders.includes("domain") || t.noInput
            : kind === "username"
              ? t.placeholders.includes("username") || t.placeholders.includes("term")
              : kind === "phone"
                ? t.placeholders.some((p) =>
                    ["phone", "e164", "number", "dt_num_only", "term"].includes(p),
                  )
                : kind === "name"
                  ? t.placeholders.some((p) =>
                      ["full", "fullname", "first", "last", "term", "query"].includes(p),
                    )
                  : true;
      if (!wants && !t.noInput) continue;
      picked.push(t);
      seen.add(t.id);
      if (picked.length >= limit) return picked;
    }
  }
  void classified;
  return picked.slice(0, limit);
}

function resolveLinks(
  tools: ToolkitTool[],
  params: Record<string, string>,
): ResolvedToolkitLink[] {
  const links: ResolvedToolkitLink[] = [];
  for (const tool of tools) {
    const res = resolveToolkitUrl(tool, params);
    if ("error" in res) continue;
    // ready if no missing, or only optional-ish leftovers and core filled
    const criticalMissing = res.missing.filter((m) => !["lat", "lon", "enddate", "since", "until"].includes(m));
    const ready = tool.noInput || criticalMissing.length === 0;
    if (!ready && criticalMissing.length > 2) continue;
    links.push({
      toolId: tool.id,
      category: tool.category,
      categoryLabel: tool.categoryLabel,
      group: tool.group,
      label: humanLabel(tool),
      url: res.url,
      missing: res.missing,
      ready,
    });
  }
  return links;
}

export function buildToolkitPackFromSubject(
  subject: SubjectInput,
  opts?: { maxPerKind?: number; maxTotal?: number },
): ToolkitOperatorPack {
  const maxPerKind = opts?.maxPerKind ?? 12;
  const maxTotal = opts?.maxTotal ?? 80;
  const indicators: ClassifiedIndicator[] = [];

  if (subject.email) indicators.push(classifyIndicator(subject.email));
  if (subject.phone) indicators.push(classifyIndicator(subject.phone));
  if (subject.username) indicators.push(classifyIndicator(subject.username));
  if (subject.website) indicators.push(classifyIndicator(subject.website));
  const name = fullName(subject);
  if (name) indicators.push(classifyIndicator(name));

  const params = mergeParams(subject, indicators);
  const tools: ToolkitTool[] = [];
  const seen = new Set<string>();

  for (const ind of indicators) {
    for (const t of pickToolsForKind(ind.kind, maxPerKind)) {
      if (!seen.has(t.id)) {
        tools.push(t);
        seen.add(t.id);
      }
    }
  }

  // Always include general search engines for the name/term
  for (const t of pickToolsForKind("unknown", 6)) {
    if (!seen.has(t.id)) {
      tools.push(t);
      seen.add(t.id);
    }
  }

  let links = resolveLinks(tools, params).filter((l) => l.ready || l.missing.length <= 1);
  links = links.slice(0, maxTotal);

  const byCategory: Record<string, ResolvedToolkitLink[]> = {};
  for (const l of links) {
    if (!byCategory[l.category]) byCategory[l.category] = [];
    byCategory[l.category].push(l);
  }

  return {
    generatedAt: new Date().toISOString(),
    indicatorSummary: indicators.map((i) => ({
      kind: i.kind,
      value: i.normalized,
      confidence: i.confidence,
    })),
    linkCount: links.length,
    readyCount: links.filter((l) => l.ready).length,
    byCategory,
    links,
    attribution:
      "Operator links from Spectra Toolkit catalog (public search endpoints; Exploratores-inspired).",
  };
}

export function buildToolkitPackFromIndicator(
  raw: string,
  opts?: { maxLinks?: number; categories?: string[] },
): ToolkitOperatorPack {
  const maxLinks = opts?.maxLinks ?? 40;
  const classified = classifyIndicator(raw);
  const params = mergeParams(undefined, [classified]);
  let tools = pickToolsForKind(classified.kind, maxLinks);

  if (opts?.categories?.length) {
    tools = listToolkitTools({ limit: 200 }).filter((t) => opts.categories!.includes(t.category));
    tools = tools.slice(0, maxLinks);
  }

  // Also use suggested categories from classifier
  if (tools.length < 8) {
    for (const cat of classified.suggestedCategories) {
      for (const t of listToolkitTools({ category: cat, limit: 15 })) {
        if (!tools.find((x) => x.id === t.id)) tools.push(t);
      }
    }
  }

  const links = resolveLinks(tools.slice(0, maxLinks), params);
  const byCategory: Record<string, ResolvedToolkitLink[]> = {};
  for (const l of links) {
    if (!byCategory[l.category]) byCategory[l.category] = [];
    byCategory[l.category].push(l);
  }

  return {
    generatedAt: new Date().toISOString(),
    indicatorSummary: [
      { kind: classified.kind, value: classified.normalized, confidence: classified.confidence },
    ],
    linkCount: links.length,
    readyCount: links.filter((l) => l.ready).length,
    byCategory,
    links,
    attribution:
      "Operator links from Spectra Toolkit catalog (public search endpoints; Exploratores-inspired).",
  };
}

/** Resolve a single tool id with freeform params. */
export function resolveSingleToolkitTool(
  toolId: string,
  params: Record<string, string>,
): ResolvedToolkitLink | { error: string } {
  const tool = getToolkitTool(toolId);
  if (!tool) return { error: `Unknown tool: ${toolId}` };
  const res = resolveToolkitUrl(tool, params);
  if ("error" in res) return res;
  return {
    toolId: tool.id,
    category: tool.category,
    categoryLabel: tool.categoryLabel,
    group: tool.group,
    label: humanLabel(tool),
    url: res.url,
    missing: res.missing,
    ready: tool.noInput || res.missing.length === 0,
  };
}
