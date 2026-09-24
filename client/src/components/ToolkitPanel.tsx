import { useCallback, useEffect, useState } from "react";

interface ToolkitCategory {
  id: string;
  count: number;
  label: string;
  group: string;
}

interface ToolkitLink {
  toolId: string;
  category: string;
  categoryLabel: string;
  group: string;
  label: string;
  url: string;
  missing: string[];
  ready: boolean;
}

interface ToolkitPack {
  linkCount: number;
  readyCount: number;
  indicatorSummary: Array<{ kind: string; value: string; confidence: number }>;
  links: ToolkitLink[];
  byCategory?: Record<string, ToolkitLink[]>;
  attribution?: string;
}

interface RedactionMapEntry {
  placeholder: string;
  kind: string;
  original: string;
  index: number;
}

type Tab = "search" | "redactor" | "iban";

export default function ToolkitPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("search");
  const [stats, setStats] = useState<{ toolCount: number; categories: number } | null>(null);
  const [categories, setCategories] = useState<ToolkitCategory[]>([]);
  const [category, setCategory] = useState("");
  const [indicator, setIndicator] = useState("");
  const [pack, setPack] = useState<ToolkitPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redactor
  const [redactIn, setRedactIn] = useState("");
  const [redactOut, setRedactOut] = useState("");
  const [redactMap, setRedactMap] = useState<RedactionMapEntry[]>([]);
  const [restoreIn, setRestoreIn] = useState("");
  const [restoreOut, setRestoreOut] = useState("");

  // IBAN
  const [ibanIn, setIbanIn] = useState("");
  const [ibanResult, setIbanResult] = useState<{
    isValid: boolean;
    message: string;
    normalized: string;
    countryName?: string;
    bankCode?: string;
    searchLinks: Array<{ engine: string; url: string }>;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const [s, c] = await Promise.all([
          fetch("/api/toolkit/stats").then((r) => r.json()),
          fetch("/api/toolkit/categories").then((r) => r.json()),
        ]);
        setStats({ toolCount: s.toolCount, categories: s.categories });
        setCategories(c.categories || []);
      } catch {
        setError("Toolkit API unavailable - is the server running?");
      }
    })();
  }, [open]);

  const runResolve = useCallback(async () => {
    if (!indicator.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/toolkit/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indicator: indicator.trim(),
          maxLinks: 60,
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setPack(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [indicator]);

  const runCategoryBrowse = useCallback(async (catId: string) => {
    setCategory(catId);
    setLoading(true);
    setError(null);
    try {
      const tools = await fetch(`/api/toolkit/tools?category=${encodeURIComponent(catId)}&limit=40`).then((r) =>
        r.json(),
      );
      const links: ToolkitLink[] = (tools.tools || []).map(
        (t: { id: string; category: string; categoryLabel: string; group: string; urlTemplate: string }) => ({
          toolId: t.id,
          category: t.category,
          categoryLabel: t.categoryLabel,
          group: t.group,
          label: t.id.replace(`${t.category}-`, "").replace(/-/g, " "),
          url: t.urlTemplate,
          missing: [],
          ready: false,
        }),
      );
      setPack({
        linkCount: links.length,
        readyCount: 0,
        indicatorSummary: [{ kind: "category", value: catId, confidence: 1 }],
        links,
        attribution: "Browse mode - enter an indicator and Resolve to fill templates.",
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  async function runRedact(preset: "client" | "counsel" | "press" = "counsel") {
    const res = await fetch("/api/toolkit/redact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: redactIn, preset }),
    });
    const data = await res.json();
    setRedactOut(data.redacted || "");
    setRedactMap(data.map || []);
  }

  async function runRestore() {
    const res = await fetch("/api/toolkit/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: restoreIn || redactOut, map: redactMap }),
    });
    const data = await res.json();
    setRestoreOut(data.restored || "");
  }

  async function runIban() {
    const res = await fetch("/api/toolkit/iban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iban: ibanIn }),
    });
    setIbanResult(await res.json());
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-14 right-6 z-30 px-4 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-violet-600 text-white text-sm font-semibold shadow-lg shadow-violet-900/40 hover:from-cyan-500 hover:to-violet-500 border border-white/10"
      >
        Toolkit
        {stats ? ` · ${stats.toolCount}` : ""}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-slate-950 shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">Spectra Toolkit</h2>
            <p className="text-xs text-slate-500">
              {stats
                ? `${stats.toolCount} operator search tools · ${stats.categories} categories`
                : "Loading catalog..."}{" "}
              · Exploratores-inspired · public sources only
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-white text-sm px-3 py-1 rounded-lg border border-white/10"
          >
            Close
          </button>
        </header>

        <div className="flex gap-2 px-5 pt-3 border-b border-white/5">
          {(
            [
              ["search", "Search pack"],
              ["redactor", "PII Redactor"],
              ["iban", "IBAN"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 ${
                tab === id
                  ? "border-cyan-400 text-cyan-300"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
          )}

          {tab === "search" && (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={indicator}
                  onChange={(e) => setIndicator(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void runResolve()}
                  placeholder="Email, phone, domain, username, name, IP, IBAN..."
                  className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
                <button
                  type="button"
                  onClick={() => void runResolve()}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {loading ? "Resolving..." : "Resolve pack"}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void runCategoryBrowse(c.id)}
                    className={`text-[10px] px-2 py-1 rounded-full border ${
                      category === c.id
                        ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                        : "border-white/10 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {c.label} ({c.count})
                  </button>
                ))}
              </div>

              {pack && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>
                      {pack.readyCount}/{pack.linkCount} ready
                    </span>
                    {pack.indicatorSummary.map((i, idx) => (
                      <span key={idx} className="font-mono text-cyan-400/80">
                        {i.kind}: {i.value}
                      </span>
                    ))}
                  </div>
                  <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                    {pack.links.map((l) => (
                      <li
                        key={l.toolId + l.url}
                        className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5 hover:border-cyan-500/20"
                      >
                        <span className="text-[10px] uppercase tracking-wide text-slate-600 w-24 shrink-0 pt-0.5">
                          {l.category}
                        </span>
                        <div className="min-w-0 flex-1">
                          <a
                            href={l.ready ? l.url : undefined}
                            target="_blank"
                            rel="noreferrer"
                            className={`text-sm ${l.ready ? "text-cyan-300 hover:underline" : "text-slate-500"}`}
                            title={l.url}
                          >
                            {l.label}
                          </a>
                          {!l.ready && l.missing.length > 0 && (
                            <p className="text-[10px] text-amber-500/80">needs: {l.missing.join(", ")}</p>
                          )}
                        </div>
                        {l.ready && (
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-violet-400 shrink-0 px-2 py-1 rounded border border-violet-500/30 hover:bg-violet-500/10"
                          >
                            Open
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                  {pack.attribution && <p className="text-[10px] text-slate-600">{pack.attribution}</p>}
                </div>
              )}
            </>
          )}

          {tab === "redactor" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Redact PII before pasting into external AI. Map stays local - never send the map with redacted text.
              </p>
              <textarea
                value={redactIn}
                onChange={(e) => setRedactIn(e.target.value)}
                rows={5}
                placeholder="Paste case notes containing emails, phones, names..."
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-sm text-white font-mono"
              />
              <div className="flex flex-wrap gap-2">
                {(["client", "counsel", "press"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => void runRedact(preset)}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm capitalize"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              {redactOut && (
                <>
                  <textarea
                    readOnly
                    value={redactOut}
                    rows={5}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-emerald-500/20 text-sm text-emerald-200/90 font-mono"
                  />
                  <p className="text-[10px] text-slate-500">{redactMap.length} placeholders in map</p>
                  <textarea
                    value={restoreIn}
                    onChange={(e) => setRestoreIn(e.target.value)}
                    rows={3}
                    placeholder="Paste AI output with [EMAIL_1] placeholders to restore..."
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-sm text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => void runRestore()}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm"
                  >
                    Restore
                  </button>
                  {restoreOut && (
                    <textarea
                      readOnly
                      value={restoreOut}
                      rows={4}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-violet-500/20 text-sm text-violet-100 font-mono"
                    />
                  )}
                </>
              )}
            </div>
          )}

          {tab === "iban" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Offline ISO 13616 mod-97 validation - nothing leaves this machine.</p>
              <div className="flex gap-2">
                <input
                  value={ibanIn}
                  onChange={(e) => setIbanIn(e.target.value)}
                  placeholder="GB82 WEST 1234 5698 7654 32"
                  className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-sm text-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => void runIban()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm"
                >
                  Validate
                </button>
              </div>
              {ibanResult && (
                <div
                  className={`p-4 rounded-xl border text-sm ${
                    ibanResult.isValid
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  }`}
                >
                  <p className="font-mono text-xs mb-1">{ibanResult.normalized}</p>
                  <p>{ibanResult.message}</p>
                  {ibanResult.countryName && (
                    <p className="text-xs mt-1 opacity-80">
                      {ibanResult.countryName}
                      {ibanResult.bankCode ? ` · bank ${ibanResult.bankCode}` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {ibanResult.searchLinks?.map((l) => (
                      <a
                        key={l.engine}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] px-2 py-1 rounded border border-white/10 hover:border-cyan-400/40 text-cyan-300"
                      >
                        {l.engine}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
