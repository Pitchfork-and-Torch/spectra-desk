import type { GitHubIntel, DomainIntel, SearchHit, SubjectInput } from "../types.js";
import { extractAnchors } from "./anchors.js";
import { fullName, locationLine } from "./subject.js";
import { nameMatchesInText } from "./name-variants.js";

export interface FusionSignals {
  boosts: Array<{ id: string; label: string; delta: number }>;
  fusedFacts: string[];
}

/** Cross-source corroboration - GitHub name ↔ domain title ↔ location in corpus */
export function fuseSignals(
  subject: SubjectInput,
  hits: SearchHit[],
  github?: GitHubIntel,
  domain?: DomainIntel,
): FusionSignals {
  const boosts: FusionSignals["boosts"] = [];
  const fusedFacts: string[] = [];
  const anchors = extractAnchors(subject);
  const corpus = hits.map((h) => `${h.title} ${h.snippet} ${h.url}`).join(" ").toLowerCase();
  const name = fullName(subject).toLowerCase();

  if (github?.name && domain?.siteTitle) {
    const gh = github.name.toLowerCase();
    const dt = domain.siteTitle.toLowerCase();
    if (gh.split(/\s+/).some((w) => w.length > 2 && dt.includes(w))) {
      boosts.push({ id: "gh-domain-name", label: "GitHub name aligns with domain site title", delta: 8 });
      fusedFacts.push(`GitHub "${github.name}" corroborated by domain title "${domain.siteTitle}"`);
    }
  }

  if (github?.blog && anchors.domains.length) {
    const blogHost = github.blog.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
    if (anchors.domains.some((d) => blogHost.includes(d) || d.includes(blogHost))) {
      boosts.push({ id: "gh-blog-domain", label: "GitHub blog matches anchor domain", delta: 10 });
      fusedFacts.push(`GitHub blog (${github.blog}) links anchor domain`);
    }
  }

  const loc = locationLine(subject).toLowerCase();
  if (loc) {
    const locParts = loc.split(/,\s*/).filter((p) => p.length > 2);
    const locHits = locParts.filter((p) => corpus.includes(p.toLowerCase())).length;
    if (locHits >= 1) {
      boosts.push({ id: "location-corpus", label: `Location "${loc}" in search corpus`, delta: 6 + locHits * 2 });
      fusedFacts.push(`Location signal "${loc}" appears in ${locHits + 1} source context(s)`);
    }
    if (github?.location && locParts.some((p) => github.location!.toLowerCase().includes(p))) {
      boosts.push({ id: "gh-location", label: "GitHub location matches intake", delta: 8 });
      fusedFacts.push(`GitHub location "${github.location}" matches intake geography`);
    }
    if (domain?.siteDescription && locParts.some((p) => domain.siteDescription!.toLowerCase().includes(p))) {
      boosts.push({ id: "domain-location", label: "Domain description mentions location", delta: 6 });
    }
  }

  if (github?.name && name) {
    const sim = nameMatchesInText(subject.firstName, subject.lastName, github.name);
    if (sim >= 0.85) {
      boosts.push({ id: "gh-name-match", label: "GitHub registered name matches subject", delta: 12 });
      fusedFacts.push(`GitHub registered name "${github.name}" matches subject`);
    }
  }

  const corroborated = hits.filter((h) => h.classification === "corroborated");
  if (corroborated.length >= 2 && anchors.domains.length) {
    const domainInMultiple = anchors.domains.some((d) =>
      corroborated.filter((h) => `${h.title} ${h.url}`.toLowerCase().includes(d)).length >= 2,
    );
    if (domainInMultiple) {
      boosts.push({ id: "multi-hit-domain", label: "Anchor domain in multiple corroborated hits", delta: 10 });
      fusedFacts.push("Anchor domain appears across multiple corroborated sources");
    }
  }

  return { boosts, fusedFacts };
}