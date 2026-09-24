# Spectra Desk — Update Report

**Date:** July 3, 2026  
**Repository:** [github.com/Pitchfork-and-Torch/spectra-desk](https://github.com/Pitchfork-and-Torch/spectra-desk)  
**Release:** v2.2.0

---

## Executive summary

Spectra Desk evolved from a fast OSINT console (v1) into an **investigator-grade identity intelligence pipeline** (v2.x). This overnight session shipped three major releases and published example reports demonstrating anchor-corroborated disambiguation for common names.

| Version | Theme | Key deliverable |
|---------|-------|-----------------|
| **v2.0** | Multiply & divide | 24-query search, homonym filter, GitHub/domain intel, investigator brief |
| **v2.1** | LE action items | Account correlation, chain of custody, legal contacts, HIBP/Wayback |
| **v2.2** | Speed & UI | Parallel cached search, query modes, GitHub repos, full client report viewer |

---

## v2.0 — Investigator-grade pipeline

### Problem
v1 assigned **93/100** to a common-name subject while mixing results for an unrelated public figure (voice actor). High scores on common names without anchor corroboration are dangerous for investigators.

### Solution architecture

```
Intake → Username probe (API-first) → GitHub + Domain/RDAP
      → Query multiplication (24 permutations) → Homonym filter
      → Anchor enrich → Social verify → Evidence capture
      → Identity graph → Investigator brief → MANIFEST
```

### New capabilities
- **Query multiplication** — name variants, `site:` anchors, username combos (up to 24 queries)
- **Username probe grid** — GitHub API, Reddit, HN, Keybase, Dev.to + 10 HTTP checks
- **Homonym filter** — auto-excludes entertainment/IMDb noise when anchors don't match
- **Investigator brief** — confidence tier, account→name table, excluded identities, LE actions
- **Modern HTML export** — self-contained brief with sidebar navigation

### Common-name subject (John Doe) — before vs after

| Metric | v1 (`spectra-0d2e4803`) | v2 (`spectra-0de40eb6`) |
|--------|-------------------------|-------------------------|
| Score | 93 (misleading) | 80 (anchor-corroborated) |
| Homonym risk | low (wrong) | **high** ✓ |
| EpicVoiceGuy noise | mixed in | **excluded** |
| GitHub | not found | anchor-linked profile |
| Domain | missing | anchor site title + location corroborated |
| Investigator tier | — | likely |

---

## v2.1 — Investigator action items

Implemented every bullet from the v2.0 investigator brief recommendations:

| Feature | Module | Purpose |
|---------|--------|---------|
| Account cross-correlation | `account-correlation.ts` | Shared domains, display names, locations across probes |
| Chain of custody | `chain-of-custody.ts` | SHA-256 manifest per case (`MANIFEST.json`) |
| Legal contacts | `legal-contacts.ts` | Law enforcement guide URLs per verified platform |
| Breach index (optional) | `breach-index.ts` | HIBP via `HIBP_API_KEY` |
| Wayback snapshots | `wayback.ts` | Internet Archive for anchor domains |
| Common-name anchor gate | `anchors.ts` | Blocks "confirmed" tier without 2+ anchors |
| Username probe dedup | `username-probe.ts` | Primary username only (no derived variant noise) |

### Best published examples
- **v2.2:** `spectra-46ac5580` — tier: likely, score 76, 5 probes, GitHub repos
- **v2.1:** `spectra-ab130f6f` — tier: likely, anchor-corroborated common-name subject
- **HTML:** `reports/published/spectra-46ac5580.html`

---

## v2.2 — Performance & polish

### Speed improvements

| Change | Impact |
|--------|--------|
| **Parallel search** (`searchWebBatch`) | 3 concurrent Playwright pages |
| **Search cache** (`search-cache.ts`) | 24h TTL in `~/.spectra-desk/search-cache/` |
| **Query modes** | `full` (24) · `fast` (12) · `validation` (8) |
| **Validation mode** | Ground-truth suite ~3× faster |

Set mode via intake `mode` field, `SPECTRA_MODE` env, or MCP `investigate_subject` parameter.

### New intel
- **GitHub repos** — `fetchGitHubRepos()` surfaces recent repositories in reports
- **Manifest API** — `GET /api/reports/:id/manifest` for chain-of-custody JSON

### UI upgrade (`ReportViewer.tsx`)
Full v2.2 tab set in the web console:
- Executive · Investigator Brief · Accounts · Search · Excluded · Social
- Correlation · Chain of Custody · Evidence · Inventory
- Manifest download link + confidence tier badge

### MCP v2.2
- Version bump to `2.2.0`
- `mode` parameter on `investigate_subject`
- Returns repos, manifest path, account correlation

---

## Validation status

Run: `npm run validate --prefix server` (uses `validation` mode — 8 queries/fixture)

| Fixture | v2.0 | v2.2 (validation mode) |
|---------|------|------------------------|
| Tim Cook + Apple | PASS (92) | **PASS (92)** |
| Barack Obama + US | PASS (82) | **PASS (82)** |
| Elon Musk + Tesla | PASS (96) | **PASS (96)** |
| John Smith + Austin | PASS (74, high risk) | **PASS (74, high risk)** |
| Satya Nadella + Microsoft | Pending | **PASS (70)** |

**5/5 passed** in ~6 minutes with search cache warm (8 queries/fixture).

---

## Files changed (v2.2)

```
server/src/modules/search-cache.ts   NEW — 24h query cache
server/src/browser.ts                — parallel batch search + cache
server/src/modules/query-multiply.ts — QueryMode: full|fast|validation
server/src/engine.ts                 — batch search, mode routing, GitHub repos
server/src/modules/github.ts         — fetchGitHubRepos()
server/src/index.ts                  — v2.2.0 health, manifest endpoint
server/src/mcp.ts                    — v2.2.0, mode param
server/src/validation/run-validation.ts — validation mode
client/src/App.tsx                   — v2.2 types, tier display
client/src/components/ReportViewer.tsx — full investigator UI tabs
server/src/modules/report-html.ts    — GitHub repos section, v2.2 footer
```

---

## How to use

```bash
# Install & dev
npm run install:all
npx playwright install chromium --prefix server
npm run dev

# Run sample investigation (John Doe)
cd server && npx tsx src/run-sample.ts

# Fast validation (8 queries/fixture)
cd server && npm run validate

# Regenerate published HTML
cd server && npm run regenerate -- spectra-ab130f6f

# Query modes
SPECTRA_MODE=fast npm run dev          # 12 queries
SPECTRA_MODE=validation npm run validate
```

---

## Roadmap (v2.3+)

- PDF export with signed manifest
- HIBP integration guide in README
- Parallel validation in CI (GitHub Actions)
- Bandcamp/Spotify API for musician subjects
- Negative signal learning (user marks wrong candidate)

---

## Legal note

Spectra Desk uses **public sources only**. Reports are investigative leads — not legal proof of identity. Chain of custody manifests support evidence handling; legal contacts point to platform LE guides. Always verify independently and follow applicable law.

---

*Generated by Spectra Desk development session — July 3, 2026*