import { useState } from "react";
import type { OsintReport } from "../App";
import ScrollFade from "./ScrollFade";

type Tab =
  | "matrix"
  | "dossier"
  | "summary"
  | "investigator"
  | "scoring"
  | "graph"
  | "accounts"
  | "search"
  | "excluded"
  | "social"
  | "correlation"
  | "custody"
  | "evidence"
  | "inventory"
  | "portraits"
  | "media";

const TIER_COLORS: Record<string, string> = {
  confirmed: "text-emerald-400",
  likely: "text-cyan-400",
  uncertain: "text-amber-400",
  insufficient: "text-orange-400",
};

const CONF_BADGE: Record<string, string> = {
  confirmed: "text-emerald-400 border-emerald-400/40",
  likely: "text-cyan-400 border-cyan-400/40",
  possible: "text-amber-400 border-amber-400/40",
};

export default function ReportViewer({
  report,
  onNew,
  onReportUpdated,
}: {
  report: OsintReport;
  onNew: () => void;
  onReportUpdated?: (report: OsintReport) => void;
}) {
  const exportBlocked =
    report.identityWorkbench?.required && !report.identityWorkbench?.confirmed;
  const [tab, setTab] = useState<Tab>(report.dossier ? "dossier" : "summary");
  const [notes, setNotes] = useState(report.dossier?.investigatorNotes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const dossier = report.dossier;
  const score = report.disambiguation.score;
  const scoreColor = score >= 75 ? "text-cyan-400" : score >= 50 ? "text-amber-400" : "text-orange-400";
  const brief = report.investigatorBrief;
  const tier = brief?.confidenceTier;
  const excludedCount = report.excludedHits?.length ?? 0;
  const probeCount = report.usernameProbes?.filter((p) => p.exists).length ?? 0;

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/dossier/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (res.ok && onReportUpdated) onReportUpdated(data.report);
    } finally {
      setSavingNotes(false);
    }
  }

  async function confirmLock() {
    const res = await fetch(`/api/reports/${report.id}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "LOCKED" }),
    });
    const data = await res.json();
    if (res.ok && onReportUpdated) onReportUpdated(data.report);
  }

  const tabs: { id: Tab; label: string }[] = [
    ...(report.corroboration ? [{ id: "matrix" as Tab, label: "Matrix" }] : []),
    ...(dossier ? [{ id: "dossier" as Tab, label: "Dossier" }] : []),
    ...(report.mediaTimeline?.entries.length ? [{ id: "media" as Tab, label: `Media (${report.mediaTimeline.entries.length})` }] : []),
    { id: "summary", label: "Executive" },
    ...(brief ? [{ id: "investigator" as Tab, label: `Brief (${tier})` }] : []),
    ...(report.disambiguation.scoreBreakdown ? [{ id: "scoring" as Tab, label: "Scoring" }] : []),
    ...(report.identityGraph?.nodes.length ? [{ id: "graph" as Tab, label: `Graph (${report.identityGraph.nodes.length})` }] : []),
    ...(probeCount || report.githubIntel || report.domainIntel
      ? [{ id: "accounts" as Tab, label: `Accounts (${probeCount || 0})` }]
      : []),
    { id: "search", label: `Search (${report.searchHits.length})` },
    ...(excludedCount ? [{ id: "excluded" as Tab, label: `Excluded (${excludedCount})` }] : []),
    { id: "social", label: `Social (${report.socialCandidates.length})` },
    ...(report.accountCorrelation?.mutualMetadata.length
      ? [{ id: "correlation" as Tab, label: "Correlation" }]
      : []),
    ...(report.chainOfCustody ? [{ id: "custody" as Tab, label: "Custody" }] : []),
    { id: "evidence", label: `Evidence (${report.evidence.length})` },
    { id: "inventory", label: "Inventory" },
    ...(report.portraitIntel?.candidates?.length
      ? [{ id: "portraits" as Tab, label: `Faces (${report.portraitIntel.candidates.length})` }]
      : []),
  ];

  return (
    <div className="h-full min-h-0 flex flex-col rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl overflow-hidden">
      <div className="shrink-0 px-6 py-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl">Intelligence Report</h3>
          <p className="text-[10px] font-mono text-slate-500 mt-1">{report.id}</p>
        </div>
        <div className="flex items-center gap-5">
          {tier && (
            <div className="text-right">
              <div className={`text-sm font-bold uppercase ${TIER_COLORS[tier] || "text-slate-400"}`}>{tier}</div>
              <div className="text-[10px] text-slate-500 uppercase">Confidence</div>
            </div>
          )}
          <div className="text-right">
            <div className={`text-3xl font-bold ${scoreColor}`}>{score}</div>
            <div className="text-[10px] text-slate-500 uppercase">Disambiguation</div>
          </div>
          {exportBlocked && (
            <span className="text-[10px] uppercase tracking-wide text-amber-300/90">Export waits on TARGET confirm</span>
          )}
        </div>
      </div>

      <div className="tab-rail shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm whitespace-nowrap ${tab === t.id ? "text-cyan-300 border-b-2 border-cyan-300" : "text-slate-500 hover:text-slate-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ScrollFade>
        <div className="text-sm">
        {tab === "dossier" && dossier && (
          <div className="space-y-5">
            {dossier.identityLocked ? (
              <p className="text-xs text-emerald-400">✓ Identity locked - {dossier.targetLabel?.slice(0, 80)}</p>
            ) : (
              <p className="text-xs text-amber-400">Confirm TARGET in Identity Workbench before operational attribution.</p>
            )}

            <div className="p-4 rounded-xl bg-black/30 border border-violet-400/20">
              <h4 className="font-semibold text-violet-300 mb-2">Who they are</h4>
              <p className="text-slate-300 leading-relaxed">{dossier.narrativeSummary}</p>
              <p className="text-xs text-slate-500 mt-2 capitalize">Tier: {dossier.confidenceTier}</p>
            </div>

            {dossier.photos.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-violet-300 mb-3">Face photos (curated)</h4>
                <div className="flex flex-wrap gap-4">
                  {dossier.photos.map((p) => (
                    <div key={p.id} className="text-center">
                      <img
                        src={p.dataUri || p.imageUrl}
                        alt={p.label}
                        className="w-28 h-28 rounded-xl object-cover border border-white/10"
                      />
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[7rem]">{p.caption}</p>
                      <span className={`text-[9px] uppercase ${CONF_BADGE[p.confidence] || ""}`}>{p.confidence}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-cyan-300 mb-2">Contact</h4>
                {dossier.contacts.length ? (
                  <ul className="space-y-1.5 text-xs">
                    {dossier.contacts.map((c, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="text-slate-400 capitalize">{c.type}</span>
                        <span className="text-slate-200 font-mono text-right">{c.value}</span>
                        <span className={CONF_BADGE[c.confidence]?.split(" ")[0]}>{c.confidence}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500 text-xs">No contacts on file.</p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-cyan-300 mb-2">Employment</h4>
                {dossier.employment.length ? (
                  <ul className="space-y-1 text-xs text-slate-300">
                    {dossier.employment.map((e, i) => (
                      <li key={i}>
                        <strong>{e.organization}</strong>
                        {e.role ? ` - ${e.role}` : ""}{" "}
                        <span className="text-slate-500">({e.confidence})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500 text-xs">Not corroborated.</p>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/5">
              <h4 className="font-semibold text-cyan-300 mb-2">Family & associates</h4>
              {dossier.relatives.length ? (
                <ul className="space-y-1 text-xs">
                  {dossier.relatives.map((r, i) => (
                    <li key={i} className="text-slate-300">
                      <span className="capitalize text-slate-500">{r.relation}:</span> {r.name}{" "}
                      <span className="text-slate-600">({r.confidence})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 text-xs">Spouse/children not found in public sources.</p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/5">
              <h4 className="font-semibold text-cyan-300 mb-2">Social profiles</h4>
              <div className="space-y-2">
                {dossier.socialProfiles.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs p-2 rounded-lg border border-white/5 hover:border-cyan-400/30"
                  >
                    <span className="text-cyan-300">{s.platform}</span> @{s.username} - {s.tier} {s.posterior}%
                    <span className="block text-slate-500 mt-0.5">{s.verificationNote}</span>
                  </a>
                ))}
              </div>
            </div>

            {dossier.gaps.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <h4 className="font-semibold text-amber-300 mb-2 text-xs uppercase tracking-wide">Collection gaps</h4>
                <ul className="text-xs text-slate-500 space-y-1">
                  {dossier.gaps.map((g, i) => (
                    <li key={i}>• {g}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-4 rounded-xl bg-black/30 border border-violet-400/20">
              <h4 className="font-semibold text-violet-300 mb-2">Investigator notes</h4>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Add operational notes - saved to case file and export..."
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
              />
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-violet-400/40 text-violet-200 hover:bg-violet-500/10 disabled:opacity-50"
              >
                {savingNotes ? "Saving..." : "Save notes"}
              </button>
            </div>

            <p className="text-[10px] text-slate-600">{dossier.disclaimer}</p>
          </div>
        )}

        {tab === "matrix" && report.corroboration && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Multiply anchors. Divide homonyms. High band only is promoted to the client brief.</p>
            {report.corroboration.mergeRefused && (
              <p className="text-xs text-amber-200">Merge refused. {report.corroboration.mergeReason}</p>
            )}
            <ul className="space-y-2">
              {report.corroboration.rows.map((row) => (
                <li key={row.id} className="p-3 rounded-xl border border-white/10 bg-black/30 text-sm">
                  <span className="text-cyan-300 font-mono text-xs">{row.band}</span>
                  <span className="ml-2 text-slate-200">{row.label}</span>
                  <span className="block text-xs text-slate-500 mt-1">
                    {row.role} · {row.anchorCount} anchors · {row.promotedToBrief ? "client brief" : "workbench"}
                    {row.dropReason ? ` · ${row.dropReason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void confirmLock()}
              className="text-xs px-3 py-2 rounded-lg border border-cyan-400/40 text-cyan-200"
            >
              I confirm LOCKED
            </button>
            <p className="text-[10px] text-slate-500">You confirm LOCKED. The machine does not.</p>
          </div>
        )}

        {tab === "summary" && (
          <div className="space-y-4">
            <p className="text-slate-300 leading-relaxed">{report.executiveSummary.replace(/\*\*/g, "")}</p>
            <div className="p-4 rounded-xl bg-black/30 border border-white/5">
              <h4 className="font-semibold text-violet-300 mb-2">Disambiguation</h4>
              <p className="text-slate-400">{report.disambiguation.label}</p>
              {report.disambiguation.homonymRisk && (
                <p className="text-xs text-amber-400/80 mt-1 capitalize">
                  Homonym risk: {report.disambiguation.homonymRisk}
                  {report.disambiguation.refined ? " · refined" : ""}
                </p>
              )}
              <ul className="mt-2 space-y-1 text-slate-500">
                {report.disambiguation.rationale.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
              {report.disambiguation.candidates && report.disambiguation.candidates.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-xs text-slate-500 mb-2">Identity candidates</p>
                  {report.disambiguation.candidates.slice(0, 4).map((c) => (
                    <a key={c.id} href={c.sourceUrl} target="_blank" rel="noreferrer" className="block text-xs text-cyan-400/90 py-0.5">
                      {c.label.slice(0, 80)} ({c.matchScore})
                    </a>
                  ))}
                </div>
              )}
            </div>
            {brief && (
              <div className="p-4 rounded-xl bg-black/30 border border-cyan-400/20">
                <h4 className="font-semibold text-cyan-300 mb-2">Investigator Assessment</h4>
                <p className="text-slate-400 text-sm">{brief.assessment}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Anchors: username {brief.anchorStatus.hasUsername ? "✓" : "✗"} · email{" "}
                  {brief.anchorStatus.hasEmail ? "✓" : "✗"} · domain {brief.anchorStatus.hasDomain ? "✓" : "✗"}
                </p>
              </div>
            )}
            {report.wikipedia && report.wikipedia.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-cyan-300 mb-2">Wikipedia</h4>
                {report.wikipedia.map((w, i) => (
                  <a key={i} href={w.url} target="_blank" rel="noreferrer" className="block text-sm text-cyan-400 py-1">
                    {w.title} - <span className="text-slate-500 text-xs">{w.description}</span>
                  </a>
                ))}
              </div>
            )}
            {report.emailIntel && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-cyan-300 mb-2">Email</h4>
                <p>
                  {report.emailIntel.email} · {report.emailIntel.domain}
                </p>
                {report.emailIntel.mxRecords && (
                  <p className="text-xs text-slate-500 mt-1">MX: {report.emailIntel.mxRecords.join(", ")}</p>
                )}
                {report.emailIntel.breachIntel?.checked && (
                  <p className="text-xs text-slate-500 mt-1">
                    Breaches: {report.emailIntel.breachIntel.breaches.length || "none found"}
                  </p>
                )}
              </div>
            )}
            {report.addressIntel?.geocoded && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-cyan-300 mb-2">Address</h4>
                <p>{report.addressIntel.geocoded.displayName}</p>
                {report.addressIntel.mapUrl && (
                  <a href={report.addressIntel.mapUrl} target="_blank" rel="noreferrer" className="text-cyan-400 text-xs">
                    View on OpenStreetMap
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "investigator" && brief && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-black/30 border border-white/5">
              <p className={`text-lg font-semibold uppercase ${TIER_COLORS[tier || ""] || "text-slate-400"}`}>
                Tier: {tier}
              </p>
              <p className="text-slate-300 mt-2">{brief.assessment}</p>
            </div>

            {brief.accountToNameLinks.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5 overflow-x-auto">
                <h4 className="font-semibold text-cyan-300 mb-3">Account → Name Correlation</h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="pb-2">Platform</th>
                      <th>Account</th>
                      <th>Linked Name</th>
                      <th>Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brief.accountToNameLinks.map((l, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="py-2">{l.platform}</td>
                        <td>
                          <a href={l.evidence} target="_blank" rel="noreferrer" className="text-cyan-400 font-mono">
                            @{l.account}
                          </a>
                        </td>
                        <td>{l.linkedName || " - "}</td>
                        <td>{l.confidence}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {brief.corroboratedFacts.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-emerald-300 mb-2">Corroborated Facts</h4>
                <ul className="space-y-1 text-slate-400">
                  {brief.corroboratedFacts.map((f, i) => (
                    <li key={i}>• {f}</li>
                  ))}
                </ul>
              </div>
            )}

            {brief.recommendedActions.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-amber-400/20">
                <h4 className="font-semibold text-amber-300 mb-2">Recommended Actions</h4>
                <ul className="space-y-1 text-slate-400">
                  {brief.recommendedActions.map((a, i) => (
                    <li key={i}>• {a}</li>
                  ))}
                </ul>
              </div>
            )}

            {brief.legalContacts.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-violet-400/20">
                <h4 className="font-semibold text-violet-300 mb-2">Legal Contacts</h4>
                <ul className="space-y-2">
                  {brief.legalContacts.map((l, i) => (
                    <li key={i} className="text-slate-400">
                      <strong className="text-slate-300">{l.platform}</strong> - {" "}
                      <a href={l.lawEnforcementUrl} target="_blank" rel="noreferrer" className="text-cyan-400">
                        Law enforcement guide
                      </a>
                      {l.notes && <span className="text-xs text-slate-500 block">{l.notes}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-slate-600">{brief.legalDisclaimer}</p>
          </div>
        )}

        {tab === "scoring" && report.disambiguation.scoreBreakdown && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-black/30 border border-white/5">
              <p className="text-2xl font-bold text-cyan-400">{report.disambiguation.scoreBreakdown.finalScore}/100</p>
              <p className="text-xs text-slate-500 mt-1">{report.disambiguation.scoreBreakdown.summary}</p>
              <p className="text-xs text-slate-600 mt-2">Base score: {report.disambiguation.scoreBreakdown.baseScore}</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="pb-2">Component</th>
                  <th>Category</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {report.disambiguation.scoreBreakdown.components.map((c) => (
                  <tr key={c.id} className="border-t border-white/5">
                    <td className="py-2">{c.label}</td>
                    <td className="text-slate-500 capitalize">{c.category}</td>
                    <td className={c.delta >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {c.delta >= 0 ? "+" : ""}
                      {c.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "graph" && report.identityGraph && (
          <div className="space-y-4">
            <div className="grid gap-2">
              {report.identityGraph.nodes.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-lg border text-xs ${
                    n.type === "person"
                      ? "border-violet-400/30 bg-violet-500/10"
                      : n.type === "account"
                        ? "border-cyan-400/30 bg-cyan-500/10"
                        : n.type === "domain"
                          ? "border-emerald-400/30 bg-emerald-500/10"
                          : "border-white/10 bg-black/20"
                  }`}
                >
                  <span className="text-[10px] uppercase text-slate-500">{n.type}</span>
                  <p className="font-medium text-slate-200">{n.label}</p>
                  {n.url && (
                    <a href={n.url.startsWith("http") ? n.url : `https://${n.url}`} target="_blank" rel="noreferrer" className="text-cyan-400">
                      {n.url}
                    </a>
                  )}
                  <span className="text-slate-500 ml-2">{n.confidence}%</span>
                </div>
              ))}
            </div>
            {report.identityGraph.edges.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-violet-300 mb-2">Relationships</h4>
                <ul className="space-y-1 text-xs text-slate-400">
                  {report.identityGraph.edges.map((e, i) => {
                    const from = report.identityGraph!.nodes.find((n) => n.id === e.from);
                    const to = report.identityGraph!.nodes.find((n) => n.id === e.to);
                    return (
                      <li key={i}>
                        <span className="text-slate-300">{from?.label || e.from}</span>
                        <span className="text-violet-400 mx-1"> - {e.relation}→</span>
                        <span className="text-slate-300">{to?.label || e.to}</span>
                        <span className="text-slate-600 ml-1">({e.confidence}%)</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "accounts" && (
          <div className="space-y-4">
            {report.githubIntel && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-cyan-300 mb-2">GitHub</h4>
                <dl className="grid grid-cols-[100px_1fr] gap-1 text-xs">
                  <dt className="text-slate-500">Login</dt>
                  <dd>
                    <a href={report.githubIntel.url} target="_blank" rel="noreferrer" className="text-cyan-400">
                      {report.githubIntel.login}
                    </a>
                  </dd>
                  {report.githubIntel.name && (
                    <>
                      <dt className="text-slate-500">Name</dt>
                      <dd>{report.githubIntel.name}</dd>
                    </>
                  )}
                  {report.githubIntel.bio && (
                    <>
                      <dt className="text-slate-500">Bio</dt>
                      <dd>{report.githubIntel.bio}</dd>
                    </>
                  )}
                  {report.githubIntel.location && (
                    <>
                      <dt className="text-slate-500">Location</dt>
                      <dd>{report.githubIntel.location}</dd>
                    </>
                  )}
                </dl>
                {report.githubIntel.repos && report.githubIntel.repos.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-xs text-slate-500 mb-2">Recent repositories</p>
                    <ul className="space-y-1">
                      {report.githubIntel.repos.map((r, i) => (
                        <li key={i}>
                          <a href={r.url} target="_blank" rel="noreferrer" className="text-cyan-400 text-xs">
                            {r.name}
                          </a>
                          {r.language && <span className="text-slate-500 text-xs ml-2">{r.language}</span>}
                          {r.description && <p className="text-slate-500 text-xs">{r.description}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {report.domainIntel && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-cyan-300 mb-2">Domain Intel</h4>
                <dl className="grid grid-cols-[100px_1fr] gap-1 text-xs">
                  <dt className="text-slate-500">Domain</dt>
                  <dd>
                    <a href={report.domainIntel.url} target="_blank" rel="noreferrer" className="text-cyan-400">
                      {report.domainIntel.domain}
                    </a>
                  </dd>
                  {report.domainIntel.siteTitle && (
                    <>
                      <dt className="text-slate-500">Title</dt>
                      <dd>{report.domainIntel.siteTitle}</dd>
                    </>
                  )}
                  {report.domainIntel.rdap?.registrar && (
                    <>
                      <dt className="text-slate-500">Registrar</dt>
                      <dd>{report.domainIntel.rdap.registrar}</dd>
                    </>
                  )}
                  {report.domainIntel.wayback?.available && report.domainIntel.wayback.snapshotUrl && (
                    <>
                      <dt className="text-slate-500">Wayback</dt>
                      <dd>
                        <a href={report.domainIntel.wayback.snapshotUrl} target="_blank" rel="noreferrer" className="text-cyan-400">
                          {report.domainIntel.wayback.timestamp || "Archive snapshot"}
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            )}
            {report.usernameProbes && report.usernameProbes.filter((p) => p.exists).length > 0 && (
              <ul className="space-y-2">
                {report.usernameProbes
                  .filter((p) => p.exists)
                  .map((p, i) => (
                    <li key={i} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5">
                      <div>
                        <span className="font-semibold text-violet-300">{p.platform}</span>
                        <a href={p.url} target="_blank" rel="noreferrer" className="block text-xs text-cyan-400/80">
                          @{p.username}
                        </a>
                        {p.displayName && <p className="text-xs text-slate-500">{p.displayName}</p>}
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-300">
                        {p.confidence}% · {p.method}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {tab === "search" && (
          <ol className="space-y-3">
            {report.searchHits.map((h, i) => (
              <li key={i} className="p-3 rounded-lg bg-black/20 border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  {h.classification && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${
                        h.classification === "corroborated"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : h.classification === "excluded"
                            ? "bg-slate-500/20 text-slate-400"
                            : "bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {h.classification}
                    </span>
                  )}
                  {h.relevanceScore != null && (
                    <span className="text-[10px] text-slate-500">{h.relevanceScore}% relevance</span>
                  )}
                </div>
                <a href={h.url} target="_blank" rel="noreferrer" className="text-cyan-400 font-medium hover:underline">
                  {h.title}
                </a>
                <p className="text-xs text-slate-500 mt-1 font-mono">q: {h.query}</p>
                {h.snippet && <p className="text-slate-400 text-xs mt-1">{h.snippet}</p>}
              </li>
            ))}
          </ol>
        )}

        {tab === "excluded" && report.excludedHits && (
          <ol className="space-y-3">
            {report.excludedHits.map((h, i) => (
              <li key={i} className="p-3 rounded-lg bg-black/20 border border-white/5 opacity-75">
                <a href={h.url} target="_blank" rel="noreferrer" className="text-slate-400 font-medium hover:underline">
                  {h.title}
                </a>
                <p className="text-xs text-amber-400/70 mt-1">{h.exclusionReason || "homonym"}</p>
              </li>
            ))}
          </ol>
        )}

        {tab === "social" && (
          <ul className="space-y-2">
            {report.socialCandidates.map((s, i) => (
              <li key={i} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5">
                <div>
                  <span className="font-semibold text-violet-300">{s.platform}</span>
                  <a href={s.url} target="_blank" rel="noreferrer" className="block text-xs text-cyan-400/80 truncate max-w-md">
                    {s.url}
                  </a>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${s.status === "found" ? "bg-cyan-500/20 text-cyan-300" : "bg-amber-500/10 text-amber-400"}`}
                >
                  {s.status} {s.confidence}%
                </span>
              </li>
            ))}
          </ul>
        )}

        {tab === "correlation" && report.accountCorrelation && (
          <div className="space-y-4">
            {report.accountCorrelation.displayNameConsensus && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-cyan-300 mb-1">Name Consensus</h4>
                <p className="text-slate-300">{report.accountCorrelation.displayNameConsensus}</p>
              </div>
            )}
            {report.accountCorrelation.mutualMetadata.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-violet-300 mb-2">Shared Metadata</h4>
                <ul className="space-y-1 text-slate-400">
                  {report.accountCorrelation.mutualMetadata.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.accountCorrelation.sharedSignals.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-violet-300 mb-2">Shared Signals</h4>
                <ul className="space-y-2">
                  {report.accountCorrelation.sharedSignals.map((s, i) => (
                    <li key={i} className="text-slate-400 text-xs">
                      <strong className="text-slate-300">{s.signal}</strong> - {s.platforms.join(", ")} ({s.confidence}%)
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.accountCorrelation.linkedDomains.length > 0 && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <h4 className="font-semibold text-cyan-300 mb-2">Linked Domains</h4>
                <ul className="space-y-1">
                  {report.accountCorrelation.linkedDomains.map((d, i) => (
                    <li key={i}>
                      <a href={`https://${d}`} target="_blank" rel="noreferrer" className="text-cyan-400 text-xs">
                        {d}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "custody" && report.chainOfCustody && (
          <div className="p-4 rounded-xl bg-black/30 border border-violet-400/20 space-y-3">
            <h4 className="font-semibold text-violet-300">Chain of Custody</h4>
            <dl className="grid grid-cols-[120px_1fr] gap-2 text-xs">
              <dt className="text-slate-500">Manifest hash</dt>
              <dd className="font-mono text-slate-400 break-all">{report.chainOfCustody.manifestHash}</dd>
              <dt className="text-slate-500">Evidence items</dt>
              <dd>{report.chainOfCustody.evidenceCount}</dd>
              <dt className="text-slate-500">Tool</dt>
              <dd>{report.chainOfCustody.tool}</dd>
              <dt className="text-slate-500">Algorithm</dt>
              <dd className="text-slate-500">{report.chainOfCustody.algorithm}</dd>
            </dl>
            <a
              href={`/api/reports/${report.id}/manifest`}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-cyan-400 hover:underline"
            >
              Download MANIFEST.json →
            </a>
          </div>
        )}

        {tab === "evidence" && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="pb-2">ID</th>
                <th>Type</th>
                <th>Source</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {report.evidence.map((e) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="py-2 font-mono">{e.id.slice(0, 12)}</td>
                  <td>{e.type}</td>
                  <td>
                    <a href={e.url} className="text-cyan-400">
                      {e.title}
                    </a>
                  </td>
                  <td className="font-mono text-slate-500">{e.hash.slice(0, 10)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "media" && report.mediaTimeline && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">{report.mediaTimeline.summary}</p>
            {report.mediaTimeline.contradictions.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                {report.mediaTimeline.contradictions.map((c, i) => (
                  <p key={i}>⚠ {c}</p>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {report.mediaTimeline.entries.map((e) => (
                <a
                  key={e.id}
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-4 rounded-xl bg-black/30 border border-white/5 hover:border-cyan-400/30"
                >
                  <div className="flex justify-between gap-2 text-xs text-slate-500 mb-1">
                    <span>{e.outlet}</span>
                    <span>{e.date || " - "} · {e.relevance}% · <span className="capitalize">{e.tone}</span></span>
                  </div>
                  <div className="text-slate-200 font-medium">{e.title}</div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{e.snippet}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {tab === "portraits" && report.portraitIntel && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">{report.portraitIntel.summary}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {report.portraitIntel.candidates.map((p) => (
                <div key={p.id} className="rounded-lg border border-white/10 overflow-hidden text-center">
                  <img
                    src={p.dataUri || p.imageUrl}
                    alt={p.label}
                    className="w-full aspect-square object-cover bg-slate-950"
                  />
                  <div className="p-2 text-[10px] text-slate-400">
                    <div className="text-slate-200 font-medium truncate">{p.label}</div>
                    {p.similarityToAnchor != null && p.role !== "anchor" && (
                      <div>{(p.similarityToAnchor * 100).toFixed(0)}% · {p.matchVerdict}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "inventory" && (
          <div className="space-y-4">
            {report.sourceInventory.map((cat) => (
              <div key={cat.category}>
                <h4 className="font-semibold text-violet-300">
                  {cat.category} <span className="text-slate-500">({cat.count})</span>
                </h4>
                <ul className="mt-1 space-y-0.5 text-slate-400 text-xs">
                  {cat.sources.slice(0, 20).map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        </div>
      </ScrollFade>
    </div>
  );
}