import type { SubjectDossier } from "../types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CONF_COLOR: Record<string, string> = {
  confirmed: "var(--green)",
  likely: "var(--cyan)",
  possible: "var(--amber)",
};

export function buildDossierHtmlSection(d: SubjectDossier): string {
  const photoGrid = d.photos.length
    ? `<div class="portrait-grid" style="margin-bottom:1.25rem">${d.photos
        .map(
          (p) =>
            `<figure class="portrait-card"><img src="${p.dataUri || esc(p.imageUrl)}" alt="${esc(p.label)}" loading="lazy"/><figcaption style="font-size:.75rem;color:var(--muted)">${esc(p.caption)} · <span style="color:${CONF_COLOR[p.confidence]}">${p.confidence}</span>${p.profileUrl ? ` · <a href="${esc(p.profileUrl)}" target="_blank" rel="noopener">source</a>` : ""}</figcaption></figure>`,
        )
        .join("")}</div>`
    : `<p style="color:var(--muted);font-size:.85rem">No curated face photos - run with domain/username anchors or confirm portraits.</p>`;

  const contactRows = d.contacts
    .map(
      (c) =>
        `<tr><td>${c.type}</td><td class="mono">${esc(c.value)}</td><td style="color:${CONF_COLOR[c.confidence]}">${c.confidence}</td><td style="font-size:.78rem;color:var(--muted)">${esc(c.source)}</td></tr>`,
    )
    .join("");

  const socialRows = d.socialProfiles
    .map(
      (s) =>
        `<tr><td>${esc(s.platform)}</td><td class="mono"><a href="${esc(s.url)}" target="_blank" rel="noopener">@${esc(s.username)}</a></td><td>${esc(s.displayName || " - ")}</td><td><span class="badge ${s.tier === "attributed" ? "ok" : s.tier === "quarantined" ? "muted" : "warn"}">${s.tier}</span> ${s.posterior}%</td><td style="font-size:.75rem;color:var(--muted)">${esc(s.verificationNote)}</td></tr>`,
    )
    .join("");

  return `<section id="dossier">
  <h2>Subject Dossier</h2>
  <div class="card">
    ${d.identityLocked ? `<p style="font-size:.82rem;color:var(--green);margin-bottom:.75rem">✓ Identity locked - TARGET: <strong>${esc(d.targetLabel || "")}</strong></p>` : `<p style="font-size:.82rem;color:var(--amber);margin-bottom:.75rem">⚠ Identity not locked - confirm TARGET in workbench before operational use.</p>`}
    <p style="font-size:1.02rem;line-height:1.55;margin-bottom:1.25rem">${esc(d.narrativeSummary)}</p>
    <p style="font-size:.78rem;color:var(--muted);margin-bottom:1rem">Confidence tier: <strong style="color:${CONF_COLOR[d.confidenceTier] || "var(--muted)"}">${d.confidenceTier}</strong> · Generated ${new Date(d.generatedAt).toLocaleString()}</p>

    <h3 style="font-size:.9rem;color:var(--violet);margin-bottom:.5rem">Visual Identification</h3>
    ${photoGrid}

    <h3 style="font-size:.9rem;color:var(--cyan);margin:1rem 0 .5rem">Contact Information</h3>
    ${contactRows ? `<table><thead><tr><th>Type</th><th>Value</th><th>Conf.</th><th>Source</th></tr></thead><tbody>${contactRows}</tbody></table>` : "<p style='color:var(--muted)'>No contacts extracted.</p>"}

    <h3 style="font-size:.9rem;color:var(--cyan);margin:1rem 0 .5rem">Employment</h3>
    ${d.employment.length ? `<ul class="clean">${d.employment.map((e) => `<li><strong>${esc(e.organization)}</strong>${e.role ? ` - ${esc(e.role)}` : ""} <span style="color:var(--muted)">[${e.confidence}]</span></li>`).join("")}</ul>` : "<p style='color:var(--muted)'>No employment corroborated.</p>"}

    <h3 style="font-size:.9rem;color:var(--cyan);margin:1rem 0 .5rem">Family &amp; Associates</h3>
    ${d.relatives.length ? `<ul class="clean">${d.relatives.map((r) => `<li><strong>${esc(r.relation)}:</strong> ${esc(r.name)} <span style="color:var(--muted)">[${r.confidence} · ${esc(r.source)}]</span></li>`).join("")}</ul>` : "<p style='color:var(--muted)'>No spouse/children found in public text.</p>"}

    <h3 style="font-size:.9rem;color:var(--cyan);margin:1rem 0 .5rem">Attributed Digital Accounts</h3>
    ${socialRows ? `<table style="font-size:.82rem"><thead><tr><th>Platform</th><th>Handle</th><th>Name</th><th>Tier</th><th>Verification</th></tr></thead><tbody>${socialRows}</tbody></table>` : "<p style='color:var(--muted)'>No multi-signal attributed accounts (existence-only probes omitted).</p>"}

    ${d.mediaHighlights.length ? `<h3 style="font-size:.9rem;color:var(--cyan);margin:1rem 0 .5rem">Media Highlights</h3><ul class="clean">${d.mediaHighlights.map((m) => `<li><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a>${m.outlet ? ` <span style="color:var(--muted)">(${esc(m.outlet)})</span>` : ""}${m.summary ? `<br/><span style="font-size:.78rem;color:var(--muted)">${esc(m.summary)}</span>` : ""}</li>`).join("")}</ul>` : ""}

    ${d.gaps.length ? `<h3 style="font-size:.9rem;color:var(--amber);margin:1rem 0 .5rem">Collection Gaps</h3><ul class="clean">${d.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}

    ${d.investigatorNotes ? `<h3 style="font-size:.9rem;color:var(--violet);margin:1rem 0 .5rem">Investigator Notes</h3><p style="white-space:pre-wrap;font-size:.88rem">${esc(d.investigatorNotes)}</p>` : ""}

    <p style="margin-top:1.25rem;font-size:.72rem;color:var(--muted)">${esc(d.disclaimer)}</p>
  </div>
</section>`;
}

export function buildDossierMarkdown(d: SubjectDossier): string {
  const lines = [
    "## Subject Dossier",
    "",
    d.identityLocked ? `**Identity locked:** ${d.targetLabel}` : "**Identity not locked** - confirm TARGET before operational use.",
    "",
    d.narrativeSummary,
    "",
    `**Confidence tier:** ${d.confidenceTier}`,
    "",
  ];

  if (d.photos.length) {
    lines.push("### Photos (curated)", "");
    for (const p of d.photos) {
      lines.push(`- ${p.label} (${p.platform}) - ${p.confidence} - ${p.caption}${p.profileUrl ? ` · [profile](${p.profileUrl})` : ""}`);
    }
    lines.push("");
  }

  if (d.contacts.length) {
    lines.push("### Contact Information", "");
    for (const c of d.contacts) {
      lines.push(`- **${c.type}:** \`${c.value}\` (${c.confidence}) - ${c.source}`);
    }
    lines.push("");
  }

  if (d.employment.length) {
    lines.push("### Employment", "");
    for (const e of d.employment) {
      lines.push(`- **${e.organization}**${e.role ? ` - ${e.role}` : ""} (${e.confidence})`);
    }
    lines.push("");
  }

  if (d.relatives.length) {
    lines.push("### Family & Associates", "");
    for (const r of d.relatives) {
      lines.push(`- **${r.relation}:** ${r.name} (${r.confidence}) - ${r.source}`);
    }
    lines.push("");
  }

  if (d.socialProfiles.length) {
    lines.push("### Social Profiles", "");
    for (const s of d.socialProfiles) {
      lines.push(`- **${s.platform}** [@${s.username}](${s.url}) - ${s.tier} ${s.posterior}% - ${s.verificationNote}`);
    }
    lines.push("");
  }

  if (d.gaps.length) {
    lines.push("### Collection Gaps", "", ...d.gaps.map((g) => `- ${g}`), "");
  }

  if (d.investigatorNotes) {
    lines.push("### Investigator Notes", "", d.investigatorNotes, "");
  }

  lines.push(`_${d.disclaimer}_`, "");
  return lines.join("\n");
}