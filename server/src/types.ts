export interface SubjectInput {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  email?: string;
  phone?: string;
  username?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  employer?: string;
  website?: string;
  notes?: string;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  source: string;
  query: string;
  relevanceScore?: number;
  classification?: "corroborated" | "possible" | "excluded";
  exclusionReason?: string;
  anchorSignals?: string[];
}

export interface SocialCandidate {
  platform: string;
  url: string;
  confidence: number;
  method: "username-pattern" | "search-hit" | "email-derived" | "verified";
  status: "found" | "possible" | "not-found" | "verified";
  verified?: boolean;
}

export interface BreachRecord {
  name: string;
  date: string;
  dataClasses: string[];
  verified: boolean;
}

export interface BreachIntel {
  email: string;
  breaches: BreachRecord[];
  checked: boolean;
  source: string;
  note?: string;
}

export interface EmailRegistrationHit {
  site: string;
  registered: boolean;
  confidence: number;
  method: string;
}

export interface EmailIntel {
  email: string;
  validFormat: boolean;
  domain: string;
  gravatarUrl?: string;
  gravatarExists?: boolean;
  mxRecords?: string[];
  publicMentions: SearchHit[];
  breachIntel?: BreachIntel;
  registrationProbes?: EmailRegistrationHit[];
}

export interface PhoneIntel {
  raw: string;
  normalized?: string;
  e164?: string;
  areaCode?: string;
  validFormat: boolean;
  searchDorks: string[];
  note?: string;
}

export interface AddressIntel {
  raw: string;
  geocoded?: { lat: number; lon: number; displayName: string };
  mapUrl?: string;
}

export interface UsernameProbe {
  platform: string;
  username: string;
  url: string;
  exists: boolean;
  displayName?: string;
  bio?: string;
  linkedUrl?: string;
  location?: string;
  confidence: number;
  method: "api" | "http-probe" | "platform-resolver" | "site-link";
}

export interface GitHubRepo {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  updatedAt: string;
}

export interface GitHubIntel {
  login: string;
  name: string | null;
  bio: string | null;
  blog: string | null;
  location: string | null;
  company: string | null;
  publicRepos: number;
  followers?: number;
  createdAt?: string;
  url: string;
  avatarUrl?: string;
  repos?: GitHubRepo[];
}

export interface ReferencePhotoMeta {
  localPath: string;
  hash: string;
  dataUri: string;
  width: number;
  height: number;
  source: "investigator-upload";
  savedAt: string;
}

export interface MediaTimelineEntry {
  id: string;
  date?: string;
  sortDate: string;
  title: string;
  url: string;
  outlet: string;
  snippet: string;
  tone: "neutral" | "positive" | "negative" | "legal" | "unknown";
  relevance: number;
  classification?: string;
}

export interface MediaTimeline {
  entries: MediaTimelineEntry[];
  summary: string;
  contradictions: string[];
}

export interface SocialProfileMetadata {
  platform: string;
  username: string;
  url: string;
  joinDate?: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  verified?: boolean;
  verificationNotes: string[];
  linkedAccounts?: string[];
  recentPosts?: Array<{ text: string; url?: string; date?: string }>;
}

export interface SiteFingerprintSummary {
  domain: string;
  title?: string;
  pagesCrawled: number;
  socialLinkCount: number;
  songTitles: string[];
  albumTitles: string[];
  uniquePhrases: string[];
  locationPhrases: string[];
}

export interface ScoredAccountSummary {
  platform: string;
  username: string;
  url: string;
  posterior: number;
  tier: "attributed" | "discovered" | "quarantined";
  evidence: Array<{ id: string; label: string; logOdds: number }>;
  displayName?: string;
  contentSimilarity?: number;
  portraitSimilarity?: number;
  portraitVerdict?: "matches-anchor" | "likely-same" | "distinct-person" | "unknown";
  linkOwnership?: "self-claimed" | "site-linked" | "collaborator" | "unknown";
  ownershipNote?: string;
}

export interface PortraitCandidate {
  id: string;
  label: string;
  platform: string;
  profileUrl?: string;
  imageUrl: string;
  localPath?: string;
  dataUri?: string;
  role: "anchor" | "subject-account" | "homonym" | "corroborating";
  handle?: string;
  dHash?: string;
  similarityToAnchor?: number;
  matchVerdict: "matches-anchor" | "likely-same" | "distinct-person" | "unknown";
  hash?: string;
  userAssignment?: "subject" | "homonym" | "reject" | "pending";
  portraitClusterId?: string;
  sourceQuery?: string;
}

export interface PortraitCluster {
  id: string;
  label: string;
  kind: "subject" | "homonym" | "unknown";
  memberIds: string[];
  anchorPortraitId?: string;
}

export interface PortraitDisambiguation {
  clusters: PortraitCluster[];
  pendingCount: number;
  userRefined: boolean;
}

export interface SubjectHistoryHint {
  priorRunCount: number;
  lastRunAt?: string;
  lastReportId?: string;
  cachedPortraitCount: number;
  cachedExclusionCount: number;
  message: string;
}

export interface PortraitHomonymProfile {
  label: string;
  portrait: PortraitCandidate;
  distinctFromAnchor: boolean;
  similarity?: number;
}

export interface PortraitIntel {
  anchorPortrait?: PortraitCandidate;
  candidates: PortraitCandidate[];
  homonymProfiles: PortraitHomonymProfile[];
  disambiguation?: PortraitDisambiguation;
  summary: string;
  method: string;
  collectedAt: string;
  fromHistory?: number;
}

export interface PersonaClusterSummary {
  id: string;
  label: string;
  description: string;
  accountCount: number;
  confidence: number;
  lifeStages?: string[];
  competing?: boolean;
}

/** v8 life-timeline event for client dossier */
export interface LifeTimelineEventSummary {
  id: string;
  dateLabel: string;
  title: string;
  description: string;
  category: string;
  confidence: "confirmed" | "likely" | "possible";
  sourceUrl?: string;
}

export interface LifeTimelineSummary {
  narrativeArc: string;
  continuityAssessment: string;
  events: LifeTimelineEventSummary[];
  personaStages: Array<{ stage: string; summary: string; supportCount: number }>;
  openQuestions: string[];
}

export interface BusinessEntitySummary {
  id: string;
  legalName: string;
  role?: string;
  industry?: string;
  strength: string;
  confidence: "confirmed" | "likely" | "possible";
  domain?: string;
  locations: string[];
  signals: string[];
  sourceUrls: string[];
  personLinkRationale: string[];
}

export interface SemanticAnalysisSummary {
  lifeStages: string[];
  continuityScore: number;
  fusedOccupations: string[];
  fusedOrganizations: string[];
  fusedLocations: string[];
  narrativeHints: string[];
  contradictionFlags: string[];
}

export interface AttributionGateSummary {
  probesTotal: number;
  probesMain: number;
  probesAppendix: number;
  hitsMain: number;
  hitsAppendix: number;
  mainAccounts: Array<{
    platform: string;
    username: string;
    url: string;
    tier: string;
    posterior: number;
    verificationNote: string;
    contentSummary?: string;
  }>;
}

export interface DomainIntel {
  domain: string;
  extractedLinks?: Array<{
    url: string;
    platform?: string;
    handle?: string;
    confidence: number;
    source: string;
    linkRole?: string;
    contextHint?: string;
  }>;
  rdap?: {
    registrar?: string;
    created?: string;
    expires?: string;
    status?: string[];
    nameservers?: string[];
    registrantCountry?: string;
  };
  siteTitle?: string;
  siteDescription?: string;
  siteTextSample?: string;
  wayback?: { available: boolean; snapshotUrl?: string; timestamp?: string };
  url: string;
}

export interface AccountCorrelation {
  sharedSignals: Array<{ signal: string; platforms: string[]; confidence: number }>;
  linkedDomains: string[];
  displayNameConsensus: string | null;
  mutualMetadata: string[];
  verifiedPlatformCount: number;
  primaryUsername?: string;
}

export interface LegalContact {
  platform: string;
  policyUrl: string;
  lawEnforcementUrl: string;
  notes: string;
}

export interface ChainOfCustody {
  reportId: string;
  generatedAt: string;
  investigationStarted: string;
  tool: string;
  evidenceCount: number;
  manifestHash: string;
  algorithm: string;
  items: Array<{
    id: string;
    type: string;
    title: string;
    url: string;
    hash: string;
    capturedAt: string;
    archivePath?: string;
  }>;
}

export interface IdentityGraphNode {
  id: string;
  type: "person" | "account" | "domain" | "source" | "organization";
  label: string;
  url?: string;
  confidence: number;
}

export interface IdentityGraphEdge {
  from: string;
  to: string;
  relation: string;
  confidence: number;
  evidence: string[];
}

export interface IdentityGraph {
  nodes: IdentityGraphNode[];
  edges: IdentityGraphEdge[];
}

export interface InvestigatorBrief {
  assessment: string;
  confidenceTier: "confirmed" | "likely" | "uncertain" | "insufficient";
  verificationWarnings: string[];
  anchorStatus: { hasUsername: boolean; hasEmail: boolean; hasDomain: boolean; sufficientForCommonName: boolean };
  accountToNameLinks: Array<{
    account: string;
    platform: string;
    linkedName?: string;
    linkedUrl?: string;
    confidence: number;
    posterior?: number;
    tier?: "attributed" | "discovered" | "quarantined";
    evidence: string;
    method: string;
  }>;
  excludedIdentities: Array<{ label: string; reason: string; sourceUrl: string }>;
  corroboratedFacts: string[];
  recommendedActions: string[];
  legalContacts: LegalContact[];
  legalDisclaimer: string;
}

export interface EvidenceItem {
  id: string;
  type: "search" | "social" | "email" | "phone" | "address" | "page-capture" | "wikipedia" | "github" | "domain" | "username-probe" | "wayback" | "breach" | "portrait";
  title: string;
  url: string;
  excerpt: string;
  hash: string;
  capturedAt: string;
  archivePath?: string;
}

export interface IdentityCandidate {
  id: string;
  label: string;
  sourceUrl: string;
  snippet: string;
  signals: string[];
  matchScore: number;
}

export interface CandidateProfileAccount {
  platform: string;
  username: string;
  url: string;
  tier: "attributed" | "discovered" | "quarantined";
  posterior: number;
  displayName?: string;
  bio?: string;
  location?: string;
  portraitVerdict?: "matches-anchor" | "likely-same" | "distinct-person" | "unknown";
}

export interface CandidateProfileMedia {
  title: string;
  url: string;
  outlet?: string;
  date?: string;
  tone?: string;
  relevance?: string;
}

export interface CandidateProfile {
  id: string;
  displayName: string;
  aliases: string[];
  likelihood: number;
  rank: number;
  verdict: "confirmed" | "likely" | "possible" | "ruled-out" | "pending";
  reasoning: string[];
  edgeCaseFlags: string[];
  employment: string[];
  locations: string[];
  associates: string[];
  timeline: Array<{ date?: string; label: string; sourceUrl?: string }>;
  portraitIds: string[];
  accounts: CandidateProfileAccount[];
  mediaMentions: CandidateProfileMedia[];
  sourceUrls: string[];
  primaryUrl: string;
  userAssignment?: "target" | "excluded" | "merge" | "pending";
}

export interface IdentityWorkbench {
  required: boolean;
  homonymRisk: "low" | "medium" | "high";
  candidateCount: number;
  profiles: CandidateProfile[];
  selectedTargetId?: string;
  confirmed: boolean;
  summary: string;
  mergeSuggestions: Array<{ profileIds: string[]; reason: string }>;
}

export type DossierConfidence = "confirmed" | "likely" | "possible";

export interface DossierContact {
  type: "email" | "phone" | "address";
  value: string;
  source: string;
  confidence: DossierConfidence;
  sourceUrl?: string;
}

export interface DossierRelative {
  relation: "spouse" | "child" | "parent" | "associate";
  name: string;
  source: string;
  confidence: DossierConfidence;
  sourceUrl?: string;
}

export interface DossierEmployment {
  organization: string;
  role?: string;
  source: string;
  confidence: DossierConfidence;
  sourceUrl?: string;
}

export interface DossierSocialProfile {
  platform: string;
  username: string;
  url: string;
  tier: "attributed" | "discovered" | "quarantined";
  posterior: number;
  displayName?: string;
  bio?: string;
  location?: string;
  verificationNote: string;
}

export interface DossierPhoto {
  id: string;
  imageUrl: string;
  dataUri?: string;
  label: string;
  platform: string;
  profileUrl?: string;
  caption: string;
  confidence: DossierConfidence;
  localPath?: string;
}

export interface DossierMediaHighlight {
  title: string;
  url: string;
  outlet?: string;
  date?: string;
  summary?: string;
}

export interface SubjectDossier {
  generatedAt: string;
  identityLocked: boolean;
  targetLabel?: string;
  confidenceTier: InvestigatorBrief["confidenceTier"];
  /** v6 multi-signal lock status (authoritative for operational use). */
  identityStatus?: "locked" | "probable" | "possible" | "insufficient";
  narrativeSummary: string;
  photos: DossierPhoto[];
  contacts: DossierContact[];
  employment: DossierEmployment[];
  relatives: DossierRelative[];
  socialProfiles: DossierSocialProfile[];
  locations: Array<{ label: string; source: string; confidence: DossierConfidence; sourceUrl?: string }>;
  mediaHighlights: DossierMediaHighlight[];
  investigatorNotes: string;
  gaps: string[];
  nextActions?: string[];
  disclaimer: string;
}

/** v6 moniker / alias inventory entry */
export interface MonikerInventoryItem {
  handle: string;
  kind: string;
  confidence: number;
  sources: string[];
  notes?: string;
}

/** v6 deep profile enrichment */
export interface DeepProfileSummary {
  platform: string;
  username: string;
  url: string;
  exists: boolean;
  displayName?: string;
  bio?: string;
  locationText?: string;
  avatarUrl?: string;
  website?: string;
  method: string;
  hasContent: boolean;
  contentHash?: string;
}

/** v6/v8 identity lock result */
export interface IdentityLockSummary {
  status: "locked" | "probable" | "possible" | "insufficient";
  score: number;
  structuralScore: number;
  contentScore: number;
  visualScore: number;
  officialRecordScore?: number;
  continuityScore?: number;
  businessScore?: number;
  signalClasses: string[];
  contradictions: string[];
  nextActions: string[];
  rationale: string[];
  scoreCapApplied?: number;
  lockedAt?: string;
  lockedBy?: "auto" | "operator";
}

export interface DisambiguationQuestion {
  id: string;
  type: "confirm-employer" | "confirm-location" | "pick-candidate" | "confirm-attribute" | "yes-no";
  question: string;
  required: boolean;
  options?: Array<{ id: string; label: string; value: string }>;
  hint?: string;
}

export interface DisambiguationAnswer {
  questionId: string;
  value: string;
  selectedOptionId?: string;
}

export interface ScoreComponent {
  id: string;
  label: string;
  delta: number;
  category: "anchor" | "corroboration" | "social" | "penalty" | "user" | "wiki";
}

export interface ScoreBreakdown {
  baseScore: number;
  finalScore: number;
  summary: string;
  components: ScoreComponent[];
}

export interface DisambiguationProfile {
  score: number;
  label: string;
  rationale: string[];
  distinguishingSignals: string[];
  homonymRisk: "low" | "medium" | "high";
  candidates: IdentityCandidate[];
  questions: DisambiguationQuestion[];
  userAnswers?: DisambiguationAnswer[];
  refined: boolean;
  scoreBreakdown?: ScoreBreakdown;
}

export interface WikipediaResult {
  title: string;
  url: string;
  description: string;
  relevance?: "anchor-match" | "topic-match";
  exclusionReason?: string;
}

export interface SearchHealthSummary {
  attempted: number;
  withHits: number;
  degraded: boolean;
  fallbackHits: number;
  enginesBlocked: boolean;
}

export interface OsintReport {
  id: string;
  subject: SubjectInput;
  createdAt: string;
  completedAt?: string;
  status: "running" | "complete" | "error" | "needs_refinement";
  spectraVersion?: string;
  searchHealth?: SearchHealthSummary;
  disambiguation: DisambiguationProfile;
  wikipedia?: WikipediaResult[];
  wikipediaExcluded?: WikipediaResult[];
  executiveSummary: string;
  searchHits: SearchHit[];
  excludedHits?: SearchHit[];
  socialCandidates: SocialCandidate[];
  usernameProbes?: UsernameProbe[];
  scoredAccounts?: ScoredAccountSummary[];
  personaClusters?: PersonaClusterSummary[];
  siteFingerprint?: SiteFingerprintSummary;
  githubIntel?: GitHubIntel;
  domainIntel?: DomainIntel;
  identityGraph?: IdentityGraph;
  investigatorBrief?: InvestigatorBrief;
  portraitIntel?: PortraitIntel;
  identityWorkbench?: IdentityWorkbench;
  dossier?: SubjectDossier;
  referencePhoto?: ReferencePhotoMeta;
  mediaTimeline?: MediaTimeline;
  socialMetadata?: SocialProfileMetadata[];
  /** v6 moniker / alias inventory */
  monikerInventory?: MonikerInventoryItem[];
  /** v6 deep profile enrichments */
  deepProfiles?: DeepProfileSummary[];
  /** v6 multi-signal identity lock */
  identityLock?: IdentityLockSummary;
  /** v6 reverse-image operator queries */
  reverseImageQueries?: Array<{ engine: string; pageUrl: string; notes: string }>;
  /** v8 semantic corpus + life continuity */
  semanticAnalysis?: SemanticAnalysisSummary;
  /** v8 business entity resolution */
  businessEntities?: BusinessEntitySummary[];
  /** v8 life timeline / narrative arc */
  lifeTimeline?: LifeTimelineSummary;
  /** v8 strict attribution gate stats */
  attributionGate?: AttributionGateSummary;
  /** v8 client-mode markdown (polished brief) */
  clientMarkdown?: string;
  /** v9 Corroborate. Optional so older case files still open. */
  demo?: boolean;
  queryFamilies?: string[];
  briefTemplate?: "client" | "vendor" | "employment-public" | "journalist-subject" | "username-only";
  pinnedNotes?: string;
  corroboration?: {
    rows: Array<{
      id: string;
      label: string;
      role: "candidate" | "homonym";
      anchorCount: number;
      band: string;
      dropReason?: string;
      promotedToBrief: boolean;
    }>;
    mergeRefused: boolean;
    mergeReason?: string;
    promoted: number;
    heldOnWorkbench: number;
  };
  claimLedger?: {
    algorithm: "SHA-256";
    rows: Array<{
      id: string;
      sentence: string;
      sourceUrl: string;
      capturedAt: string;
      sha256: string;
      band: string;
      survivesBrief: boolean;
    }>;
  };
  merkleSeal?: {
    algorithm: "merkle-sha256";
    leafCount: number;
    root: string | null;
    pendingHumanLock: boolean;
  };
  /** v7 Toolkit operator pack (Exploratores-inspired public search links) */
  toolkitPack?: {
    generatedAt: string;
    linkCount: number;
    readyCount: number;
    indicatorSummary: Array<{ kind: string; value: string; confidence: number }>;
    links: Array<{
      toolId: string;
      category: string;
      categoryLabel: string;
      group: string;
      label: string;
      url: string;
      missing: string[];
      ready: boolean;
    }>;
    attribution: string;
  };
  pdfFilename?: string;
  subjectHistoryHint?: SubjectHistoryHint;
  accountCorrelation?: AccountCorrelation;
  chainOfCustody?: ChainOfCustody;
  emailIntel?: EmailIntel;
  phoneIntel?: PhoneIntel;
  addressIntel?: AddressIntel;
  evidence: EvidenceItem[];
  sourceInventory: Array<{ category: string; count: number; sources: string[] }>;
  markdown: string;
  html: string;
  exportFilename?: string;
  exportBasename?: string;
}

export interface RunProgress {
  phase: string;
  percent: number;
  message: string;
}

export interface ValidationFixture {
  name: string;
  subject: SubjectInput;
  groundTruth: {
    field: keyof SubjectInput | "wikipediaTitle";
    expected: string;
    mustAppearInHits?: boolean;
    minDisambiguationScore?: number;
    expectHomonymRisk?: "low" | "medium" | "high";
    /** Top disambiguation candidate URL must contain this substring (e.g. linkedin.com/in). */
    expectTopCandidateContains?: string;
    /** These URL substrings must NOT appear in socialCandidates or top probes. */
    mustExcludeFromSocial?: string[];
    /** LinkedIn must outrank GitHub in disambiguation candidates when both present. */
    expectLinkedInOverGitHub?: boolean;
  };
}