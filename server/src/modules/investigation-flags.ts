export interface InvestigationFlags {
  deepDomainCrawl: boolean;
  contentFingerprint: boolean;
  archiveTimeloop: boolean;
  promoteHttpProbe: boolean;
  twitchDiscovery: boolean;
  steamDiscovery: boolean;
  embeddings: boolean;
  maxCrawlPages: number;
  maxCrawlDepth: number;
  crawlDelayMs: number;
}

export const DEFAULT_FLAGS: InvestigationFlags = {
  deepDomainCrawl: true,
  contentFingerprint: true,
  archiveTimeloop: true,
  promoteHttpProbe: false,
  twitchDiscovery: true,
  steamDiscovery: true,
  embeddings: process.env.SPECTRA_EMBEDDINGS !== "false",
  maxCrawlPages: 20,
  maxCrawlDepth: 2,
  crawlDelayMs: 600,
};

export function resolveFlags(raw?: Record<string, string | undefined>, mode?: "full" | "fast" | "validation"): InvestigationFlags {
  const f = { ...DEFAULT_FLAGS };
  if (raw?.deepCrawl === "false") f.deepDomainCrawl = false;
  if (raw?.embeddings === "true") f.embeddings = true;
  if (raw?.embeddings === "false") f.embeddings = false;
  if (raw?.httpProbe === "true") f.promoteHttpProbe = true;
  if (mode === "fast") {
    f.archiveTimeloop = false;
    f.maxCrawlPages = 8;
    f.crawlDelayMs = 250;
  }
  if (mode === "validation") {
    f.archiveTimeloop = false;
    f.maxCrawlPages = 4;
    f.crawlDelayMs = 200;
  }
  return f;
}