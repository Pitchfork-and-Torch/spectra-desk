# Changelog

## v9.0.0 Corroborate (2026-09-24)

The machine does not LOCK. You do.

- Corroboration matrix with confidence bands. Homonym drops stay on the workbench.
- Claim ledger: source URL, captured-at, SHA-256, and band on each surviving line.
- Merkle seal is written when a person confirms LOCKED.
- Counsel and press redaction presets. Client skin keeps the brief.
- Case desk: list, rename, archive, export, destroy with a hash receipt. DEMO case is Avery Quill, a fictional composite.
- Fast stays capped at 12. Full is capped at 28. The desk can show the query plan before it spends it.
- CLI and MCP: intake, divide, brief, lock, export, doctor, toolkit, case. Agents cannot LOCK.
- Toolkit catalog counted at 898. Quiet list stays empty.
- Windows installer and portable zip are hashed and unsigned.
- No license key. No subscription. Public sources only. Investigative lead, not legal proof of identity.

## v8.2.0 - Desk chrome (2026-09-04)

### CI
- Desktop `npm audit` is production-only (`--omit=dev`) and does not fail the ship on registry 503 / network errors
- Dependabot pull requests disabled (public main is one commit; bump deps in the product commit)

### Desktop
- Window opens maximized to the display work area so the desk fits without dragging the frame
- Header export slots (PDF, HTML, Manifest, New Report) are visible from first launch, dim until a dossier exists, then light
- Created by Pitchfork-and-Torch in About, footer, and Windows file metadata, with GitHub and X links
- Report pane fills the remaining height with a "More in this brief" fade when content continues below
- Fontshare Clash Display + Satoshi, matching the public landing

## v8.1.1 - Free Windows app (2026-09-04)

### Product
- **No license gate** - packaged app opens with no key, no Stripe checkout
- Subscribe worker now points at the free download instead of charging
- Stripe stack stays in `licensing/` parked if we ever want paid later

## v8.1.0 - Release-ready desktop (2026-09-03)

### Product
- **Honest health** - `/api/health` now reports version, Chromium OK, toolkit count, and desktop flag. Removed unimplemented `grok-synthesis` feature flag.
- **Intake UX** - username and employer/domain sit on the main form (no longer behind More fields). Default search depth is Fast (12 queries).
- **Engine warning** - UI banners if packaged Chromium is missing or the toolkit catalog is thin.

### Desktop
- **Free port** - if 3847 is busy, bind 3848+.
- **Health wait** - splash waits for JSON `{ ok, version }`, not just HTTP 200.
- **License** - `license.jonbailey.xyz` first, Workers.dev fallback.
- **Help** - Operator Guide from packaged docs; license portal on the custom domain. ASCII About text.
- **SPECTRA_SMOKE=1** - start engine, write health marker, quit (unattended packaged test).

### Release
- START-HERE generated from the current version (no more leftover v7 copy).
- `npm run smoke:packaged` against `desktop/release/win-unpacked`.

## v8.0.2 - Print-first client PDF + version discipline (2026-07-23)

### Product
- **Single version source** - `server/src/version.ts` drives API, MCP, engine, chain-of-custody, brand, and reports; UI loads version from `/api/health`; Electron About reads `package.json`
- **Print-first client brief** - light paper theme (system fonts, high contrast). Fixes unreadable dark cards on white PDF pages
- **PDF pipeline** - emulates print/light media; professional header/footer with live version
- **Business entity merge** - collapses BIO Scene Care / LLC / BBB title variants; BBB+name → likely
- **Lock honesty** - no auto-LOCKED without operator unless multi-class fusion includes business ≥ likely
- **Media demotion** - Laurenzi/Dadivoso collisions and ESPN template placeholders dropped from client highlights

### Operator note
- Header/footer no longer hardcode v7.0; always track release package version

## v8.0.1 - Desktop Chromium launch fix (2026-07-23)

### Fix
- **Playwright headless_shell crash on desktop** - Playwright 1.52+ still launches `chromium_headless_shell` for headless mode even when `PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL=0`. The installer only ships full Chromium, so investigations failed with "Executable doesn't exist ... chrome-headless-shell.exe".
- `launchChromium()` now always resolves and passes full `chrome.exe` via `executablePath` (scans `PLAYWRIGHT_BROWSERS_PATH` / `SPECTRA_CHROMIUM_PATH`).
- Electron shell sets `SPECTRA_CHROMIUM_PATH` from packaged `chromium-*/chrome-win64/chrome.exe` before starting the engine.

## v8.0.0 - Client OSINT Dossier Engine (2026-07-23)

### Product
- **Disambiguation-first client briefs** - primary HTML/PDF is a polished 6 - 12 page intelligence deliverable, not a 30+ page probe dump
- **Semantic content understanding** - occupations, orgs, life stages, consistency/mismatch vs intake anchors
- **Business entity fusion** - person↔company links from Sunbiz, BBB, website About, interviews, LinkedIn-class hits
- **Life-timeline narrative** - multi-stage arcs (e.g. MMA → military → Tampa BIO Scene Care) treated as **positive continuity**, not automatic homonym noise
- **Strict attribution gate** - main report shows ATTRIBUTED/LIKELY only; HTTP existence probes archived
- **Employment sanitize** - rejects FAQ/snippet garbage ("How many employees are there?")

### Scoring
- Official records + business fusion dominate over raw search-hit / username-probe counts
- Continuity component for multi-profession uncommon-name personas
- Structural-only cap retained when no content/records/business/visual

### Modules
- `semantic-content.ts` · `business-entity.ts` · `life-timeline.ts` · `attribution-gate.ts` · `client-report.ts`
- Upgraded: `multi-signal-scorer`, `persona-cluster`, `dossier`, `engine` (export = client brief)

### Regression
- `v8-dustin-regression.test.ts` - Dustin Daprizio fixture encodes §2 failures from the v7 31-page sample
- Docs: `docs/v8/ARCHITECTURE-V8.md` · `GAP-ANALYSIS-DUSTIN-V8.md` · `OPERATOR-GUIDE.md`

### Policy
- Unchanged: public sources only · investigative lead - not legal proof · human-in-the-loop for LOCKED

## v7.0.0 - Spectra Toolkit (2026-07-22)

### Product
- **Spectra Toolkit** - operator workbench inspired by [Exploratores](https://github.com/SOsintOps/Exploratores) (SOsintOps), reimplemented natively for Spectra Desk
- **898 public search tools** across people, domains, social, geo, media, company/finance
- **PII Redactor** - numbered placeholders + restore map for safe external AI handoff (local only)
- **IBAN intel** - offline ISO 13616 mod-97 validation + public search links
- **Indicator classifier** - email / phone / domain / IP / username / IBAN / crypto / VIN / name routing
- Every investigation attaches a **`toolkitPack`** of ready operator URLs

### Surfaces
- GUI floating **Toolkit** panel (Search pack · Redactor · IBAN)
- REST: `/api/toolkit/stats|categories|tools|resolve|classify|redact|restore|iban`
- MCP: `list_toolkit_tools`, `toolkit_pack`, `resolve_toolkit_url`, `classify_indicator`, `redact_pii`, `restore_pii`, `analyze_iban`, `get_toolkit_pack`

### Data & tooling
- `server/src/data/toolkit-catalog.json` - importable catalog
- `scripts/import-exploratores-catalog.mjs` - regenerate from local Exploratores clone
- `docs/v7/ARCHITECTURE-V7.md` · `docs/v7/OPERATOR-GUIDE.md` · `THIRD-PARTY-TOOLKIT.md`

### Licence note
- Exploratores is AGPL-3.0; Spectra does **not** copy AGPL app code. Catalog is a factual public-URL list with attribution; modules are Spectra-native TypeScript.

## v6.0.0 - Dossier Engine (2026-07-23)

### Product
- **Spectra Desk Pro / Dossier Engine** - multi-signal identity lock, moniker inventory, deep profiles, portrait quality gate, reverse-image packs, public-record dorks
- Identity status: `locked | probable | possible | insufficient` (authoritative over raw score)
- Structural-only scores **capped (~58)** - no more "94 + insufficient" without content/faces

### Engines
- `moniker-engine` - alias tree (dotted, initial, nickname, leet, aka, gaming) + discovery dorks
- `deep-profile` - public API/OG enrichment (bio, avatar, location, links)
- `portrait-quality` - reject YouTube/Google/platform logos from Subject Gallery
- `multi-signal-scorer` + `identity-lock` - content + visual + structural fusion
- `reverse-image` - Yandex/Google Lens/TinEye/Bing public query builders
- `public-records-dorks` - news, courts, property, business, MMA/public-record pivots
- `face-cluster` - dHash clusters on face-quality portraits only

### MCP
- Expanded to **19 tools** including `discover_monikers`, `enrich_profile`, `get_identity_lock`, `reverse_image_search`, `filter_portraits`, `public_record_dorks`, inventory getters

### Docs
- `docs/v6/GAP-ANALYSIS-DUSTIN.md` · `ARCHITECTURE-V6.md` · `IMPLEMENTATION-PLAN.md` · `MIGRATION-V5-TO-V6.md` · `OPERATOR-GUIDE.md`

### Tests
- New unit coverage for moniker, portrait quality, multi-signal lock, deep-profile content gate, reverse-image builders

## v5.1.0 - Majors + disambiguation polish + desktop release (2026-07-22)

### Dependencies (majors)
- **Zod 4**, **TypeScript 7**, **Vite 8**, **@vitejs/plugin-react 6**, **png-to-ico 3**
- MCP `z.record` two-arg fix; client CSS module types for TS7

### Disambiguation effectiveness
- **Unwrap Bing/Google/DDG redirect URLs** so real destinations (LinkedIn, news, records) reach scoring
- **Filter first-name entertainment collisions** (comic strips, fandom) when surname is absent
- **Always inject LinkedIn professional pivot** when `/in/` profiles are blocked by search engines
- Treat successful noise filtering as a **positive** signal; boost uncommon surnames + LI pivots
- Full-name public-record/news hits (MMA, arrest, Florida) corroborated for LE-class subjects

### Desktop
- Windows installer + portable package for v5.1.0

## v5.0.2 - Dependency refresh (2026-07-22)

### Dependencies
- **Server:** hono 4.12.31, @hono/node-server 2.0.11, tsx 4.23.1, vitest 4.1.10, MCP SDK 1.29.0; override nested `@hono/node-server` to clear moderate audit
- **Client:** React 19.2.8, Tailwind 4.3.3, @tailwindcss/vite 4.3.3
- **Desktop:** Electron 43.2.0, @types/node 26.1.1
- **Licensing:** wrangler 4.111.0 + @cloudflare/workers-types 5.x

## v5.0.1 - CI restore, MCP parity, version alignment (2026-07-22)

### Reliability
- **CI fixed** - repo Actions policy was `local_only`, so every workflow failed at startup; allowed GitHub-owned actions and **SHA-pinned** `actions/checkout` + `actions/setup-node`
- **Version alignment** - root, server, client, desktop, engine, MCP, and brand all report **5.0.1**

### MCP (v5 parity)
- Bumped MCP server to engine version
- Richer `investigate_subject` summary (workbench, dossier, portraits, media timeline)
- New tools: `confirm_identity`, `assign_portraits`, `get_dossier`, `save_dossier_notes`, `subject_history`
- Accepts `website` on investigate intake

### Docs
- README / architecture / test counts brought current with the v5 product surface

## v5.0.0 - Identity Workbench & Subject Dossier (2026-07-03)

### Investigator UX
- **Identity Workbench** - candidate profiles, confirm TARGET, exclude/merge wrong identities
- **Subject Dossier** - narrative brief, contacts, employment, relatives, social tiers, gaps, investigator notes
- **PDF export** - case PDF alongside shareable HTML
- **Reference photo** - operator-supplied anchor image for portrait matching
- **Media timeline** - chronological press/media highlights with tone tags

### Pipeline
- Candidate profile synthesis from search + probes + portraits
- Dossier extraction + optional Grok narrative synthesis hook
- Social metadata enrichment

## v4.4.0 - Portrait UI & history (2026-07-03)

- Interactive portrait disambiguation UI
- Subject search history cache
- Faces collected from dork / profile results

## v4.0.0 - Desktop & licensing (2026-07-03)

- Windows Electron desktop app
- Monthly subscription licensing (Stripe + Cloudflare Worker)
- Release packaging scripts

## v3.1.0 - Operational naming & signal fusion (2026-07-03)

### HTML export naming
- Reports saved as **`LastName_FirstName_YYYY-MM-DD_shortId.html`**
- Auto-published to `reports/published/` with human-readable filename
- Example: `Doe_John_2026-07-03_ab130f6f.html`

### Disambiguation upgrades
- **Signal fusion** - cross-corroborates GitHub name ↔ domain title ↔ location ↔ blog
- **Negative signal persistence** - `~/.spectra-desk/negative-signals.json` for user-marked wrong identities
- **Expanded homonym rules** - sports profiles, obituaries, people-search aggregators
- `POST /api/reports/:id/exclude` - mark wrong candidate and re-score

### HTML report UX
- Sticky top bar with case ID and basename
- In-report search filter
- Scroll-spy navigation with active section highlighting
- Identity graph section
- Print/PDF button
- Manifest hash in footer

## v3.0.0 - Production-grade foundation (2026-07-03)

### Critical fixes
- **Refine pipeline** - preserves prior search hits; re-queries with updated anchors (fast mode) instead of scoring empty corpus
- **API validation** - Zod schema on investigate endpoints with clear error messages

### Intelligence & accuracy
- **Explainable scoring** - `scoreBreakdown` with per-component deltas in reports, HTML, and UI
- **Homonym validation** - ground-truth suite now asserts `homonymRisk` for John Smith fixture

### Reliability
- **Search resilience** - exponential backoff retries, CAPTCHA/block detection, improved DOM selectors
- **Structured logging** - JSON logs via `SPECTRA_LOG_LEVEL` env

### Testing
- **Vitest unit suite** - anchors, homonym filter, disambiguation, score breakdown
- **CI** - runs unit tests + smoke tests on every push

### UX
- **Query mode selector** - full/fast/validation in intake form
- **Common-name warning** - prompts for anchors before run
- **Identity graph tab** - nodes and relationships in report viewer
- **Scoring tab** - transparent score components
- **Progress ETA** - estimated time remaining during investigations

### Distribution
- **CLI** - `npm run cli --prefix server -- investigate|list|show|validate`
- **Docker** - `Dockerfile` + `docker-compose.yml` for self-hosted API
- **Architecture docs** - `ARCHITECTURE.md` with Mermaid diagram

## v2.2.0 - Speed & UI (2026-07-03)
- Parallel cached search, query modes, GitHub repos, full ReportViewer tabs, manifest API

## v2.1.0 - Investigator actions (2026-07-03)
- Account correlation, chain of custody, legal contacts, HIBP/Wayback, anchor gate

## v2.0.0 - Investigator-grade OSINT (2026-07-03)
- Query multiplication, homonym filter, GitHub/domain intel, investigator brief
