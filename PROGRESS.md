# Spectra Desk — Progress Log

**Last updated:** 2026-07-03 (v3.0 — production-grade foundation)

## Shipped: v2.0 — Investigator-Grade OSINT

### Problem solved
v1 over-scored common names (e.g. John Doe → 93/100 while mixing unrelated homonyms). v2 **multiplies anchor signals** and **divides homonyms** before attribution.

### New modules (`server/src/modules/`)

| File | Purpose |
|------|---------|
| `query-multiply.ts` | Up to 24 search permutations (name variants, `site:` anchors, username combos) |
| `anchors.ts` | Extract & score username/domain/email/location anchor tokens |
| `homonym-filter.ts` | Classify hits: corroborated / possible / excluded |
| `github.ts` | GitHub REST API profile enrichment |
| `domain.ts` | RDAP/WHOIS + live site scrape |
| `username-probe.ts` | Cross-platform probe (GitHub, Reddit, HN, Keybase, Dev.to, + HTTP grid) |
| `identity-graph.ts` | Person ↔ account ↔ domain correlation graph |
| `investigator-brief.ts` | LE-oriented tier, account→name table, excluded identities, recommended actions |
| `report-html.ts` | Modern self-contained HTML brief (v2 sections) |

### Pipeline changes (`engine.ts`)
1. Username probe **before** web search (API-first)
2. GitHub API + domain intel phases
3. Exhaustive search → anchor enrich → homonym filter
4. Capture corroborated URLs + anchor site
5. Identity graph + investigator brief synthesis

### MCP v2 (`mcp.ts`)
- `investigate_subject` — full v2 pipeline
- `correlate_username` — standalone cross-platform username sweep
- `get_report` / `list_reports` / `refine_disambiguation`

### Example reports (`reports/published/`)
- `spectra-0d2e4803.html` — v1 common-name case (homonym collision, overconfident)
- `spectra-0de40eb6.html` — **v2 common-name case** (anchor-corroborated, homonyms excluded)

### Common-name v2 results (`spectra-0de40eb6`)
| Metric | v1 | v2 |
|--------|----|----|
| Score | 93 (wrong) | 80 (anchor-corroborated) |
| Homonym risk | low | **high** ✓ |
| GitHub | not-found | anchor-linked profile |
| Domain | missing | anchor site corroborated |
| Username probes | 2 | 17 verified |
| Evidence | 18 | 37 |
| Investigator tier | — | likely |

### Validation (v2 run, 2026-07-03)
| Fixture | Score | Risk | Result |
|---------|-------|------|--------|
| Tim Cook + Apple | 92 | low | PASS |
| Barack Obama + US | 82 | low | PASS |
| Elon Musk + Tesla | 96 | low | PASS |
| John Smith + Austin | 74 | **high** | PASS |
| Satya Nadella + Microsoft | — | — | In progress at session end |

Run: `npm run validate --prefix server` (~20 min with 24 queries/fixture)

---

## Shipped: v2.1 — Investigator Actions Implemented

| Feature | Module |
|---------|--------|
| Account cross-correlation | `account-correlation.ts` — shared domains, display names, locations |
| Chain of custody | `chain-of-custody.ts` + `MANIFEST.json` per case |
| Legal contacts | `legal-contacts.ts` — LE guides per verified platform |
| Breach index (optional) | `breach-index.ts` — HIBP via `HIBP_API_KEY` env |
| Wayback snapshots | `wayback.ts` — Internet Archive for anchor domains |
| Common-name anchor gate | `hasMinimumAnchors()` — blocks confirmed tier without 2+ anchors |
| Username probe dedup | Primary username + 1 derived variant only |
| Smart recommendations | Actionable, deduped — no repeated platform lists |

### Env vars
- `HIBP_API_KEY` — optional Have I Been Pwned breach correlation

---

## Shipped: v3.0 — Production-grade foundation

| Feature | Details |
|---------|---------|
| Refine pipeline fix | Preserves hits; re-queries on anchor change |
| Explainable scoring | `scoreBreakdown` in API, HTML, UI |
| Vitest unit tests | 16 tests — anchors, homonym, disambiguate |
| CLI | `npm run cli --prefix server` |
| Docker | `docker compose up` |
| Search resilience | Retries, CAPTCHA detection, better selectors |
| API validation | Zod on investigate endpoints |
| Identity graph UI | Graph + Scoring tabs in ReportViewer |
| Architecture docs | `ARCHITECTURE.md` |

See **[CHANGELOG.md](CHANGELOG.md)** for full details.

---

## Shipped: v2.2 — Speed, Cache & Full UI

| Feature | Module / file |
|---------|---------------|
| Parallel search (3 pages) | `browser.ts` — `searchWebBatch()` |
| 24h search cache | `search-cache.ts` — `~/.spectra-desk/search-cache/` |
| Query modes | `query-multiply.ts` — `full` (24) · `fast` (12) · `validation` (8) |
| GitHub repos | `github.ts` — `fetchGitHubRepos()` |
| Manifest API | `index.ts` — `GET /api/reports/:id/manifest` |
| Full report viewer | `ReportViewer.tsx` — investigator, accounts, excluded, custody tabs |
| MCP v2.2 | `mcp.ts` — mode param, version 2.2.0 |

### Env vars (v2.2)
- `SPECTRA_MODE` — default query mode (`full`|`fast`|`validation`)

### Published examples
- `spectra-46ac5580.html` — **v2.2 common-name case** (tier: likely, score 76, 5 probes)
- `spectra-ab130f6f.html` — v2.1 common-name case (tier: likely)
- Validation: **5/5 pass** (v2.2 validation mode, ~6 min)

See **[UPDATE-REPORT.md](UPDATE-REPORT.md)** for full changelog.

---

## Resume next session

### Priority 1 — Reliability
- [ ] Confirm 5/5 validation pass with v2.2 validation mode
- [ ] CI: parallel validation job with cache warm

### Priority 2 — Investigator features
- [ ] PDF export + signed evidence manifest
- [ ] HIBP setup guide in README

### Priority 3 — Disambiguation hardening
- [ ] Email as required anchor for common-name cases (auto-prompt)
- [ ] Negative signal learning (user marks wrong candidate → persist)
- [ ] Bandcamp/Spotify API enrichment for musician subjects

### Commands
```bash
# Dev
cd spectra-desk && npm run dev

# Re-run sample investigation
cd server && npx tsx src/run-sample.ts

# Regenerate HTML from stored JSON
cd server && npm run regenerate -- spectra-0de40eb6

# Validate
cd server && npm run validate
```

### Local paths
- Reports store: `~/.spectra-desk/`
- Published examples: `spectra-desk/reports/published/`
- MCP config: `~/.grok/config.toml` (spectra server)