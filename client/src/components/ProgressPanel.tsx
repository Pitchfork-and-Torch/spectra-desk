const PHASES = ["init", "wikipedia", "username-probe", "domain", "search", "social", "email", "address", "capture", "disambiguate", "report", "refine", "done"];

function estimateRemaining(percent: number): string | null {
  if (percent <= 5 || percent >= 95) return null;
  const remaining = Math.round(((100 - percent) / percent) * 2);
  if (remaining < 1) return "< 1 min remaining";
  return `~${remaining} min remaining`;
}

export default function ProgressPanel({
  phase,
  percent,
  message,
}: {
  phase: string;
  percent: number;
  message: string;
}) {
  const idx = PHASES.indexOf(phase) >= 0 ? PHASES.indexOf(phase) : PHASES.findIndex((p) => phase.startsWith(p.slice(0, 4)));
  const eta = estimateRemaining(percent);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        Investigation in progress
      </h3>

      <div className="h-2 bg-black/50 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-sm text-slate-300 font-mono mb-1">{message}</p>
      {eta && <p className="text-xs text-slate-500 mb-6">{eta}</p>}
      {!eta && <div className="mb-6" />}

      <div className="grid grid-cols-3 gap-2 text-xs">
        {PHASES.filter((p) => p !== "done").map((p, i) => (
          <div
            key={p}
            className={`px-2 py-1.5 rounded-lg text-center capitalize ${
              i < idx ? "bg-cyan-500/20 text-cyan-300" : i === idx ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30" : "bg-white/5 text-slate-600"
            }`}
          >
            {p}
          </div>
        ))}
      </div>
    </div>
  );
}