import { useEffect, useState } from "react";
import IntakeForm from "./components/IntakeForm";
import ProgressPanel from "./components/ProgressPanel";
import ReportViewer from "./components/ReportViewer";
import DisambiguationPanel from "./components/DisambiguationPanel";
import PortraitDisambiguationPanel, {
  type PortraitIntel as UiPortraitIntel,
} from "./components/PortraitDisambiguationPanel";
import IdentityWorkbenchPanel, { type IdentityWorkbench } from "./components/IdentityWorkbenchPanel";
import SpectraLogo from "./components/SpectraLogo";
import ToolkitPanel from "./components/ToolkitPanel";
import ExportBar from "./components/ExportBar";
import { SPECTRA_VERSION } from "./version";

export type QueryMode = "full" | "fast" | "validation" | "custom";

export interface SubjectForm {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
  username: string;
  address: string;
  city: string;
  state: string;
  country: string;
  employer: string;
  notes: string;
  mode: QueryMode;
  referencePhoto?: string;
}

export interface DisambiguationQuestion {
  id: string;
  type: string;
  question: string;
  required: boolean;
  options?: Array<{ id: string; label: string; value: string }>;
  hint?: string;
}

export interface OsintReport {
  id: string;
  status: string;
  executiveSummary: string;
  disambiguation: {
    score: number;
    label: string;
    rationale: string[];
    homonymRisk: string;
    candidates: Array<{ id: string; label: string; sourceUrl: string; matchScore: number }>;
    questions: DisambiguationQuestion[];
    refined: boolean;
    scoreBreakdown?: {
      baseScore: number;
      finalScore: number;
      summary: string;
      components: Array<{ id: string; label: string; delta: number; category: string }>;
    };
  };
  identityGraph?: {
    nodes: Array<{ id: string; type: string; label: string; url?: string; confidence: number }>;
    edges: Array<{ from: string; to: string; relation: string; confidence: number; evidence: string[] }>;
  };
  investigatorBrief?: {
    assessment: string;
    confidenceTier: string;
    anchorStatus: { hasUsername: boolean; hasEmail: boolean; hasDomain: boolean; sufficientForCommonName: boolean };
    accountToNameLinks: Array<{ account: string; platform: string; linkedName?: string; linkedUrl?: string; confidence: number; evidence: string; method: string }>;
    excludedIdentities: Array<{ label: string; reason: string; sourceUrl: string }>;
    corroboratedFacts: string[];
    recommendedActions: string[];
    legalContacts: Array<{ platform: string; lawEnforcementUrl: string; notes: string }>;
    legalDisclaimer: string;
  };
  accountCorrelation?: {
    displayNameConsensus: string | null;
    mutualMetadata: string[];
    sharedSignals: Array<{ signal: string; platforms: string[]; confidence: number }>;
    linkedDomains: string[];
  };
  chainOfCustody?: { manifestHash: string; evidenceCount: number; tool: string; algorithm: string };
  usernameProbes?: Array<{ platform: string; username: string; url: string; exists: boolean; displayName?: string; confidence: number; method: string }>;
  githubIntel?: { login: string; name: string | null; bio: string | null; blog: string | null; location: string | null; url: string; repos?: Array<{ name: string; url: string; description: string | null; language: string | null }> };
  domainIntel?: { domain: string; siteTitle?: string; siteDescription?: string; url: string; rdap?: { registrar?: string; created?: string }; wayback?: { available: boolean; snapshotUrl?: string; timestamp?: string } };
  excludedHits?: Array<{ title: string; url: string; exclusionReason?: string; classification?: string }>;
  wikipedia?: Array<{ title: string; url: string; description: string }>;
  searchHits: Array<{ title: string; url: string; query: string; snippet: string; relevanceScore?: number; classification?: string; anchorSignals?: string[] }>;
  socialCandidates: Array<{ platform: string; url: string; confidence: number; status: string; method: string }>;
  emailIntel?: { email: string; domain: string; mxRecords?: string[]; gravatarUrl?: string; gravatarExists?: boolean; breachIntel?: { checked: boolean; breaches: Array<{ name: string; date: string }>; note?: string } };
  addressIntel?: { raw: string; geocoded?: { displayName: string }; mapUrl?: string };
  evidence: Array<{ id: string; type: string; title: string; url: string; hash: string; capturedAt?: string }>;
  sourceInventory: Array<{ category: string; count: number; sources: string[] }>;
  markdown: string;
  exportFilename?: string;
  exportBasename?: string;
  portraitIntel?: {
    candidates: Array<{
      id: string;
      label: string;
      platform: string;
      profileUrl?: string;
      dataUri?: string;
      imageUrl: string;
      role: string;
      similarityToAnchor?: number;
      matchVerdict: string;
      userAssignment?: "subject" | "homonym" | "reject" | "pending";
    }>;
    anchorPortrait?: { id: string; label: string; platform: string; dataUri?: string; imageUrl: string };
    disambiguation?: {
      clusters: Array<{ id: string; label: string; kind: string; memberIds: string[] }>;
      pendingCount: number;
      userRefined: boolean;
    };
    summary: string;
    fromHistory?: number;
  };
  subjectHistoryHint?: {
    priorRunCount: number;
    message: string;
    lastReportId?: string;
    cachedPortraitCount?: number;
  };
  identityWorkbench?: IdentityWorkbench;
  dossier?: {
    generatedAt: string;
    identityLocked: boolean;
    targetLabel?: string;
    confidenceTier: string;
    narrativeSummary: string;
    photos: Array<{ id: string; imageUrl: string; dataUri?: string; label: string; caption: string; confidence: string }>;
    contacts: Array<{ type: string; value: string; source: string; confidence: string }>;
    employment: Array<{ organization: string; role?: string; confidence: string }>;
    relatives: Array<{ relation: string; name: string; confidence: string }>;
    socialProfiles: Array<{ platform: string; username: string; url: string; tier: string; posterior: number; verificationNote: string }>;
    gaps: string[];
    investigatorNotes: string;
    disclaimer: string;
  };
  referencePhoto?: { dataUri: string; width: number; height: number };
  mediaTimeline?: {
    summary: string;
    contradictions: string[];
    entries: Array<{ id: string; title: string; url: string; outlet: string; date?: string; snippet: string; tone: string; relevance: number }>;
  };
  socialMetadata?: Array<{ platform: string; username: string; url: string; joinDate?: string; followerCount?: number; verificationNotes: string[] }>;
  toolkitPack?: {
    generatedAt: string;
    linkCount: number;
    readyCount: number;
    indicatorSummary: Array<{ kind: string; value: string; confidence: number }>;
    links: Array<{
      toolId: string;
      category: string;
      label: string;
      url: string;
      ready: boolean;
    }>;
    attribution: string;
  };
  pdfFilename?: string;
  demo?: boolean;
  briefTemplate?: string;
  corroboration?: {
    mergeRefused: boolean;
    mergeReason?: string;
    rows: Array<{ id: string; label: string; role: string; band: string; anchorCount: number; dropReason?: string; promotedToBrief: boolean }>;
  };
  claimLedger?: { rows: Array<{ id: string; sentence: string; sourceUrl: string; sha256: string; band: string }> };
  merkleSeal?: { root: string | null; pendingHumanLock: boolean };
  identityLock?: { status: string; lockedBy?: string; score: number };
}

const TIER_COLORS: Record<string, string> = {
  confirmed: "text-emerald-400",
  likely: "text-cyan-400",
  uncertain: "text-amber-400",
  insufficient: "text-orange-400",
};

export default function App() {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "refine">("idle");
  const [progress, setProgress] = useState({ phase: "", percent: 0, message: "" });
  const [report, setReport] = useState<OsintReport | null>(null);
  const [showDisambiguation, setShowDisambiguation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthLine, setHealthLine] = useState("Health pending");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data: { version?: string; toolkitCount?: number; port?: number }) => {
        setHealthLine(`v${data.version || SPECTRA_VERSION} · tools ${data.toolkitCount ?? "?"} · cases %USERPROFILE%\\.spectra-desk`);
      })
      .catch(() => setHealthLine("Health unreachable"));
  }, []);

  async function runInvestigation(data: SubjectForm) {
    setPhase("running");
    setError(null);
    setReport(null);
    setShowDisambiguation(false);
    setProgress({ phase: "init", percent: 0, message: "Starting investigation..." });

    const res = await fetch("/api/investigate/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok || !res.body) {
      setError("Failed to connect to Spectra API");
      setPhase("idle");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "progress") {
            setProgress({ phase: payload.phase, percent: payload.percent, message: payload.message });
          } else if (payload.type === "complete") {
            setReport(payload.report);
            const needsWorkbench =
              payload.report.identityWorkbench?.required && !payload.report.identityWorkbench?.confirmed;
            const needsRefine =
              !needsWorkbench &&
              payload.report.disambiguation?.questions?.length > 0 &&
              !payload.report.disambiguation?.refined &&
              (payload.report.disambiguation?.homonymRisk === "high" ||
                payload.report.investigatorBrief?.anchorStatus?.sufficientForCommonName === false);
            setShowDisambiguation(needsRefine);
            setPhase(needsWorkbench || needsRefine ? "refine" : "done");
          } else if (payload.type === "error") {
            setError(payload.message);
            setPhase("idle");
          }
        } catch {
          /* skip */
        }
      }
    }
  }

  function handleRefined(updated: unknown) {
    setReport(updated as OsintReport);
    setShowDisambiguation(false);
    setPhase("done");
  }

  const tier = report?.investigatorBrief?.confidenceTier;
  const [appVersion, setAppVersion] = useState<string>(SPECTRA_VERSION);
  const [engineWarn, setEngineWarn] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { version?: string; chromiumOk?: boolean; toolkitCount?: number }) => {
        if (d?.version) setAppVersion(d.version);
        if (d?.chromiumOk === false) setEngineWarn("Chromium missing - investigations that need a browser will fail. Reinstall Spectra Desk.");
        else if (typeof d?.toolkitCount === "number" && d.toolkitCount < 800) {
          setEngineWarn("Toolkit catalog looks thin. Check server/src/data/toolkit-catalog.json.");
        }
      })
      .catch(() => setAppVersion(SPECTRA_VERSION));
  }, []);

  const exportBlocked =
    Boolean(report?.identityWorkbench?.required && !report?.identityWorkbench?.confirmed);
  const canExport = Boolean(report) && !exportBlocked;
  const reset = () => {
    setReport(null);
    setPhase("idle");
    setShowDisambiguation(false);
    setError(null);
  };

  return (
    <div className="app-shell grid-bg">
      <ToolkitPanel />
      <header className="app-header">
        <div className="px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <SpectraLogo size={36} />
            <div className="min-w-0">
              <h1 className="text-lg leading-none">Spectra Desk</h1>
              <p className="text-[10px] text-slate-500 mt-1 tracking-wide uppercase">
                Client dossier · v{appVersion}
              </p>
              <p className="text-[10px] text-cyan-200/70 mt-1">{healthLine}</p>
            </div>
          </div>
          <ExportBar
            reportId={report?.id}
            canExport={canExport}
            canManifest={Boolean(report?.chainOfCustody)}
            canReset={Boolean(report)}
            onNew={reset}
          />
          <div className="flex items-center gap-2 shrink-0">
            {tier && (
              <span className={`text-[10px] font-mono uppercase ${TIER_COLORS[tier] || "text-slate-400"}`}>
                {tier}
              </span>
            )}
            <span className="text-[10px] font-mono text-cyan-300/80 border border-cyan-400/20 px-2.5 py-1 rounded-full">
              PUBLIC SOURCES ONLY
            </span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {phase === "idle" && !report && (
          <div className="idle-stage">
            <div className="idle-form">
              {engineWarn && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-400/30 text-amber-200 text-sm">{engineWarn}</div>
              )}
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
              )}
              <IntakeForm onSubmit={runInvestigation} />
            </div>
            <div className="idle-copy">
              <p className="text-[10px] tracking-[0.22em] uppercase text-cyan-300/80 mb-3">v{appVersion} Windows desk</p>
              <h2>The public web, as a brief.</h2>
              <p className="text-slate-400 max-w-[36ch] text-[0.95rem] leading-relaxed">
                Name, email, or username in. A sourced client dossier out. Homonyms divided. Every lead hashed.
              </p>
              <p className="text-xs text-slate-600 mt-8">
                PDF, HTML, and Manifest stay dim until this run has a dossier. Then they light.
              </p>
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="w-full h-full flex items-center justify-center p-8">
            <div className="w-full max-w-xl">
              <ProgressPanel {...progress} />
            </div>
          </div>
        )}

        {report && (phase === "done" || phase === "refine") && (
          <div className="report-stage">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
            )}
            {(showDisambiguation || report.identityWorkbench?.profiles?.length || report.portraitIntel?.candidates?.length) ? (
              <div className="shrink-0 max-h-[32%] overflow-auto space-y-3 pr-1">
                {report.identityWorkbench?.profiles?.length ? (
                  <IdentityWorkbenchPanel
                    reportId={report.id}
                    workbench={report.identityWorkbench}
                    portraits={report.portraitIntel?.candidates?.map((c) => ({
                      id: c.id,
                      dataUri: c.dataUri,
                      imageUrl: c.imageUrl,
                      label: c.label,
                    }))}
                    onConfirmed={(updated) => {
                      setReport(updated as OsintReport);
                      setPhase("done");
                    }}
                  />
                ) : null}
                {showDisambiguation && (
                  <DisambiguationPanel
                    reportId={report.id}
                    questions={report.disambiguation.questions}
                    score={report.disambiguation.score}
                    homonymRisk={report.disambiguation.homonymRisk}
                    onRefined={handleRefined}
                    onSkip={() => { setShowDisambiguation(false); setPhase("done"); }}
                  />
                )}
                {report.portraitIntel?.candidates?.length ? (
                  <PortraitDisambiguationPanel
                    reportId={report.id}
                    portraitIntel={report.portraitIntel as UiPortraitIntel}
                    subjectHistoryHint={report.subjectHistoryHint}
                    onUpdated={(updated) => setReport(updated as OsintReport)}
                  />
                ) : null}
              </div>
            ) : null}
            <div className="report-stage__body">
              <ReportViewer
                report={report}
                onReportUpdated={(updated) => setReport(updated)}
                onNew={reset}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>Spectra Desk v{appVersion} · public sources only · not legal proof</span>
        <span>
          Created by{" "}
          <a href="https://github.com/Pitchfork-and-Torch" target="_blank" rel="noreferrer">
            Pitchfork-and-Torch
          </a>
          {" · "}
          <a href="https://github.com/Pitchfork-and-Torch/spectra-desk" target="_blank" rel="noreferrer">
            GitHub
          </a>
          {" · "}
          <a href="https://x.com/suddenlyjon" target="_blank" rel="noreferrer">
            @suddenlyjon
          </a>
        </span>
      </footer>
    </div>
  );
}