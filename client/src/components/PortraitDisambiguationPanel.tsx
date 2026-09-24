import { useMemo, useState } from "react";

export interface PortraitCandidate {
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
}

interface PortraitCluster {
  id: string;
  label: string;
  kind: "subject" | "homonym" | "unknown";
  memberIds: string[];
}

export interface PortraitIntel {
  anchorPortrait?: PortraitCandidate;
  candidates: PortraitCandidate[];
  disambiguation?: { clusters: PortraitCluster[]; pendingCount: number; userRefined: boolean };
  summary: string;
  fromHistory?: number;
}

export interface SubjectHistoryHint {
  priorRunCount: number;
  message: string;
  lastReportId?: string;
}

interface Props {
  reportId: string;
  portraitIntel: PortraitIntel;
  subjectHistoryHint?: SubjectHistoryHint;
  onUpdated: (report: unknown) => void;
}

const VERDICT_COLOR: Record<string, string> = {
  "matches-anchor": "border-emerald-400/50 bg-emerald-500/10",
  "likely-same": "border-cyan-400/40 bg-cyan-500/10",
  "distinct-person": "border-red-400/40 bg-red-500/10",
  unknown: "border-white/10 bg-slate-800/40",
};

const ASSIGN_COLOR: Record<string, string> = {
  subject: "ring-2 ring-emerald-400",
  homonym: "ring-2 ring-red-400",
  reject: "ring-2 ring-orange-400 opacity-60",
  pending: "",
};

export default function PortraitDisambiguationPanel({
  reportId,
  portraitIntel,
  subjectHistoryHint,
  onUpdated,
}: Props) {
  const [draft, setDraft] = useState<Record<string, "subject" | "homonym" | "reject">>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = portraitIntel.candidates.filter((c) => c.dataUri || c.imageUrl);
  function resolveAssignment(id: string, stored?: PortraitCandidate["userAssignment"]) {
    return (draft[id] ?? stored ?? "pending") as "subject" | "homonym" | "reject" | "pending";
  }

  const pendingCount = useMemo(
    () => candidates.filter((c) => resolveAssignment(c.id, c.userAssignment) === "pending").length,
    [candidates, draft],
  );

  if (!candidates.length) return null;

  function setAssignment(id: string, assignment: "subject" | "homonym" | "reject") {
    setDraft((d) => ({ ...d, [id]: assignment }));
  }

  async function applyAssignments() {
    const assignments = Object.entries(draft).map(([portraitId, assignment]) => ({
      portraitId,
      assignment,
    }));
    if (!assignments.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/portraits/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save portrait assignments");
      setDraft({});
      onUpdated(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const clusters = portraitIntel.disambiguation?.clusters || [];

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 backdrop-blur-xl p-6 space-y-5">
      <div>
        <h3 className="font-semibold text-violet-200 flex items-center gap-2">
          <span>◉</span> Visual Identity Disambiguation
        </h3>
        <p className="text-sm text-slate-400 mt-1">{portraitIntel.summary}</p>
        {subjectHistoryHint && (
          <p className="text-xs text-cyan-400/90 mt-2 font-mono">{subjectHistoryHint.message}</p>
        )}
        {portraitIntel.fromHistory ? (
          <p className="text-xs text-slate-500 mt-1">
            {portraitIntel.fromHistory} face(s) pre-labeled from search history
          </p>
        ) : null}
      </div>

      {clusters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clusters.map((cl) => (
            <span
              key={cl.id}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                cl.kind === "subject"
                  ? "border-emerald-400/40 text-emerald-300"
                  : cl.kind === "homonym"
                    ? "border-red-400/40 text-red-300"
                    : "border-amber-400/40 text-amber-300"
              }`}
            >
              {cl.label} ({cl.memberIds.length})
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Tap a face to assign it to your subject or mark it as a different person. Assignments are saved locally and
        speed up the next investigation of the same name.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {candidates.map((c) => {
          const assignment = resolveAssignment(c.id, c.userAssignment);
          const src = c.dataUri || c.imageUrl;
          const sim =
            c.similarityToAnchor != null && c.role !== "anchor"
              ? `${(c.similarityToAnchor * 100).toFixed(0)}% match`
              : c.role === "anchor"
                ? "anchor"
                : null;
          return (
            <div
              key={c.id}
              className={`rounded-xl border overflow-hidden transition ${VERDICT_COLOR[c.matchVerdict] || VERDICT_COLOR.unknown} ${ASSIGN_COLOR[assignment]}`}
            >
              <div className="aspect-square bg-slate-950 relative">
                <img src={src} alt={c.label} className="w-full h-full object-cover" loading="lazy" />
                {assignment !== "pending" && (
                  <span className="absolute top-1 right-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/70 text-white">
                    {assignment}
                  </span>
                )}
              </div>
              <div className="p-2 space-y-1.5">
                <p className="text-[11px] font-medium text-slate-200 line-clamp-2 leading-tight">{c.label}</p>
                <p className="text-[10px] text-slate-500">{c.platform}{sim ? ` · ${sim}` : ""}</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    title="This is the subject"
                    onClick={() => setAssignment(c.id, "subject")}
                    className={`flex-1 text-[10px] py-1 rounded border ${assignment === "subject" ? "bg-emerald-500/30 border-emerald-400/50 text-emerald-200" : "border-white/10 text-slate-400 hover:bg-white/5"}`}
                  >
                    Subject
                  </button>
                  <button
                    type="button"
                    title="Different person"
                    onClick={() => setAssignment(c.id, "homonym")}
                    className={`flex-1 text-[10px] py-1 rounded border ${assignment === "homonym" ? "bg-red-500/30 border-red-400/50 text-red-200" : "border-white/10 text-slate-400 hover:bg-white/5"}`}
                  >
                    Other
                  </button>
                </div>
                {c.profileUrl && (
                  <a
                    href={c.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-violet-400 hover:underline block truncate"
                  >
                    Profile ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span className="text-xs text-slate-500">
          {pendingCount > 0 ? `${pendingCount} face(s) still unassigned` : "All faces reviewed"}
          {Object.keys(draft).length > 0 && ` · ${Object.keys(draft).length} unsaved change(s)`}
        </span>
        <button
          type="button"
          disabled={loading || Object.keys(draft).length === 0}
          onClick={applyAssignments}
          className="text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 text-slate-950 font-semibold disabled:opacity-40"
        >
          {loading ? "Applying..." : "Apply & re-score accounts"}
        </button>
      </div>
    </div>
  );
}