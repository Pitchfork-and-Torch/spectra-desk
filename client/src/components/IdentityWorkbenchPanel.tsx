import { useMemo, useState } from "react";

export interface CandidateProfileAccount {
  platform: string;
  username: string;
  url: string;
  tier: string;
  posterior: number;
  displayName?: string;
  bio?: string;
  location?: string;
}

export interface CandidateProfile {
  id: string;
  displayName: string;
  aliases: string[];
  likelihood: number;
  rank: number;
  verdict: string;
  reasoning: string[];
  edgeCaseFlags: string[];
  employment: string[];
  locations: string[];
  portraitIds: string[];
  accounts: CandidateProfileAccount[];
  mediaMentions: Array<{ title: string; url: string; outlet?: string; date?: string }>;
  primaryUrl: string;
  userAssignment?: string;
}

export interface IdentityWorkbench {
  required: boolean;
  homonymRisk: string;
  candidateCount: number;
  profiles: CandidateProfile[];
  selectedTargetId?: string;
  confirmed: boolean;
  summary: string;
  mergeSuggestions: Array<{ profileIds: string[]; reason: string }>;
}

interface PortraitRef {
  id: string;
  dataUri?: string;
  imageUrl: string;
  label: string;
}

interface Props {
  reportId: string;
  workbench: IdentityWorkbench;
  portraits?: PortraitRef[];
  onConfirmed: (report: unknown) => void;
}

const VERDICT_STYLE: Record<string, string> = {
  confirmed: "text-emerald-400 border-emerald-400/40 bg-emerald-500/10",
  likely: "text-cyan-400 border-cyan-400/40 bg-cyan-500/10",
  possible: "text-amber-400 border-amber-400/40 bg-amber-500/10",
  "ruled-out": "text-red-400 border-red-400/40 bg-red-500/10",
  pending: "text-slate-400 border-white/10 bg-slate-800/40",
};

const EDGE_LABELS: Record<string, string> = {
  "common-name": "Common name",
  "possible-deceased": "Possible deceased",
  "international-subject": "International",
  "low-digital-footprint": "Low footprint",
  "high-profile": "High profile",
  "contradictory-signals": "Contradictory signals",
  "homonym-noise-present": "Homonym noise",
};

export default function IdentityWorkbenchPanel({ reportId, workbench, portraits = [], onConfirmed }: Props) {
  const [targetId, setTargetId] = useState<string | null>(workbench.selectedTargetId || null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const portraitMap = useMemo(() => new Map(portraits.map((p) => [p.id, p])), [portraits]);

  const activeProfiles = workbench.profiles.filter((p) => p.verdict !== "ruled-out" && p.userAssignment !== "excluded");

  if (!workbench.profiles.length) return null;

  function toggleExclude(id: string) {
    if (targetId === id) return;
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmTarget() {
    if (!targetId) {
      setError("Select one candidate as TARGET before confirming.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/identity/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          excludedIds: [...excluded],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Confirmation failed");
      onConfirmed(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (workbench.confirmed) {
    const target = workbench.profiles.find((p) => p.id === workbench.selectedTargetId);
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-xl p-5">
        <h3 className="font-semibold text-emerald-200 flex items-center gap-2">
          <span>✓</span> Identity confirmed
        </h3>
        <p className="text-sm text-slate-400 mt-1">{workbench.summary}</p>
        {target && (
          <p className="text-xs text-emerald-300/80 mt-2 font-mono">
            TARGET: {target.displayName.slice(0, 100)} ({target.likelihood}%)
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-500/40 bg-violet-500/5 backdrop-blur-xl p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-violet-200 flex items-center gap-2 text-lg">
          <span>◇</span> Identity Workbench
          {workbench.required && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-500/50 text-amber-300">
              confirmation required
            </span>
          )}
        </h3>
        <p className="text-sm text-slate-400 mt-1">{workbench.summary}</p>
        <p className="text-xs text-slate-500 mt-1">
          Homonym risk: <span className="capitalize text-amber-300/90">{workbench.homonymRisk}</span> ·{" "}
          {workbench.candidateCount} ranked candidate(s)
        </p>
      </div>

      {workbench.mergeSuggestions.length > 0 && (
        <div className="text-xs text-slate-500 border border-white/5 rounded-lg p-3 bg-black/20">
          <span className="text-violet-300">Merge hints: </span>
          {workbench.mergeSuggestions.map((m, i) => (
            <span key={i} className="block mt-1">
              {m.reason}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {activeProfiles.map((p) => {
          const isTarget = targetId === p.id;
          const isExcluded = excluded.has(p.id);
          const thumbs = p.portraitIds.map((id) => portraitMap.get(id)).filter(Boolean).slice(0, 3);

          return (
            <div
              key={p.id}
              className={`rounded-xl border p-4 transition ${
                isTarget
                  ? "border-emerald-400/60 bg-emerald-500/10 ring-1 ring-emerald-400/30"
                  : isExcluded
                    ? "border-red-400/30 bg-red-500/5 opacity-50"
                    : "border-white/10 bg-black/30 hover:border-violet-400/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-500">#{p.rank}</span>
                    <span
                      className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${VERDICT_STYLE[p.verdict] || VERDICT_STYLE.pending}`}
                    >
                      {p.verdict}
                    </span>
                    <span className="text-lg font-bold text-violet-200">{p.likelihood}%</span>
                  </div>
                  <h4 className="font-medium text-slate-100 mt-1 line-clamp-2">{p.displayName}</h4>
                  {p.aliases.length > 1 && (
                    <p className="text-[10px] text-slate-500 mt-0.5">AKA: {p.aliases.slice(1, 4).join(" · ")}</p>
                  )}
                </div>
                {thumbs.length > 0 && (
                  <div className="flex gap-1 shrink-0">
                    {thumbs.map((t) => (
                      <img
                        key={t!.id}
                        src={t!.dataUri || t!.imageUrl}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover border border-white/10"
                      />
                    ))}
                  </div>
                )}
              </div>

              {p.edgeCaseFlags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.edgeCaseFlags.map((f) => (
                    <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300/90 border border-amber-500/20">
                      {EDGE_LABELS[f] || f}
                    </span>
                  ))}
                </div>
              )}

              <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500 max-h-24 overflow-y-auto">
                {p.reasoning.slice(0, 5).map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>

              {(p.locations.length > 0 || p.employment.length > 0) && (
                <p className="text-[10px] text-slate-500 mt-2">
                  {p.locations.length ? `📍 ${p.locations.slice(0, 2).join("; ")}` : ""}
                  {p.employment.length ? ` · 💼 ${p.employment.slice(0, 2).join("; ")}` : ""}
                </p>
              )}

              {p.accounts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.accounts.slice(0, 4).map((a) => (
                    <a
                      key={a.url}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] px-2 py-0.5 rounded border border-cyan-400/20 text-cyan-300/90 hover:bg-cyan-400/10"
                    >
                      {a.platform} @{a.username} ({a.posterior}%)
                    </a>
                  ))}
                </div>
              )}

              {p.mediaMentions.length > 0 && (
                <div className="mt-2 text-[10px] text-slate-500">
                  Media: {p.mediaMentions.slice(0, 2).map((m) => m.outlet || m.title.slice(0, 30)).join(" · ")}
                </div>
              )}

              <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setTargetId(p.id);
                    setExcluded((prev) => {
                      const n = new Set(prev);
                      n.delete(p.id);
                      return n;
                    });
                  }}
                  className={`flex-1 text-xs py-2 rounded-lg border transition ${
                    isTarget
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                      : "border-white/10 text-slate-400 hover:border-emerald-400/40"
                  }`}
                >
                  {isTarget ? "✓ TARGET" : "Select TARGET"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleExclude(p.id)}
                  disabled={isTarget}
                  className={`text-xs px-3 py-2 rounded-lg border transition ${
                    isExcluded ? "border-red-400/50 text-red-300" : "border-white/10 text-slate-500 hover:text-red-300"
                  }`}
                >
                  Exclude
                </button>
                <a
                  href={p.primaryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-2 py-2 rounded-lg border border-white/10 text-slate-500 hover:text-cyan-300"
                  title="Open primary source"
                >
                  ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={confirmTarget}
        disabled={loading || !targetId}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-violet-500/25 border border-violet-400/50 text-violet-100 hover:bg-violet-500/35 disabled:opacity-40"
      >
        {loading ? "Locking identity..." : "Confirm TARGET & lock profile for dossier"}
      </button>

      {workbench.required && (
        <p className="text-[10px] text-center text-amber-400/70">
          Export and operational attribution should wait until TARGET is confirmed.
        </p>
      )}
    </div>
  );
}