# Spectra Desk — Development & Release Procedure

## Day-to-day workflow

```bash
npm run install:all          # server + client + desktop deps
npm run dev                  # API :3847 + UI :5173
npm test --prefix server     # unit tests (Vitest)
npm run smoke:packaged       # unpacked Windows engine + SPECTRA_SMOKE exe (after dist:win)
```

## Making changes

1. **Edit code** in `server/src/` (engine, modules) and/or `client/src/` (React UI).
2. **Run tests** — `npm test --prefix server`
3. **Smoke the UI** — `npm run dev`, run a John Doe investigation, verify portrait panel + report.
4. **Commit** with a clear message (`feat:`, `fix:`, `refactor:`).
5. **Push** to `main` on the private GitHub repo.

```bash
git add -A
git commit -m "feat(v4.4): describe your change"
git push origin main
```

## Major desktop releases

When shipping a new installer to GitHub Releases:

```bash
npm run dist:win             # build installer + portable
npm run package:release      # zip + checksums → dist/release/
gh release create vX.Y.Z-desktop --repo Pitchfork-and-Torch/spectra-desk \
  --title "Spectra Desk vX.Y.Z Desktop" \
  --notes "Release notes" \
  dist/release/*
```

Or upload to an existing tag: `gh release upload vX.Y.Z-desktop --clobber dist/release/*`

## Architecture map

| Layer | Path | Role |
|-------|------|------|
| Engine | `server/src/engine.ts` | Investigation pipeline orchestration |
| Portrait | `server/src/modules/portrait-*.ts` | Face collection, dHash, UI clusters |
| History | `server/src/modules/subject-history.ts` | Per-name cache (`~/.spectra-desk/subject-history.json`) |
| API | `server/src/index.ts` | REST + SSE |
| UI | `client/src/components/` | Intake, progress, portrait disambiguation, report |
| Desktop | `desktop/` | Electron shell + license gate |
| Licensing | `licensing/` | Stripe subscription Worker |

## v4.4 — Portrait disambiguation & subject history

- **Search portraits:** After dork/search, `enrichSourcesFromSearchHits` pulls `og:image` from result pages.
- **Visual UI:** `PortraitDisambiguationPanel` — assign faces to subject vs homonym; re-scores accounts.
- **Subject history:** Prior runs store portrait dHash labels, exclusions, and query log for faster re-runs.
- **API:** `GET /api/subject-history`, `POST /api/reports/:id/portraits/assign`

## Local data (not in git)

```
%USERPROFILE%\.spectra-desk\
  cases\                  # per-investigation evidence
  subject-history.json    # cross-run name cache
  negative-signals.json   # user-marked wrong identities
  search-cache\           # 24h query cache
```

## Skip license gate (dev)

```bash
set SPECTRA_LICENSE_SKIP=1
npm run desktop:dev
```