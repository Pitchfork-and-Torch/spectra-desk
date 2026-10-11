# Spectra Desk v6.0 - Implementation Plan

## Roadmap

### Phase 0 - Foundation (this ship) · ~1 - 2 weeks effort equivalent
- [x] Gap analysis (Dustin case)
- [x] Architecture document
- [x] Moniker engine + tests
- [x] Portrait quality gate + tests
- [x] Deep profile extractor (OG/HTML/API) + tests
- [x] Multi-signal scorer + identity lock + tests
- [x] Reverse-image query builders + optional fetch
- [x] Public-record dork expansion
- [x] Types + engine wiring (v6 phases)
- [x] MCP expansion (core new tools)
- [x] Validation fixtures for Dustin-class honesty
- [x] Operator guide + migration notes

### Phase 1 - MVP Beta · 2 - 3 weeks
- Platform adapters: GitHub, Reddit, X (public), Instagram og, TikTok og
- Playwright deep enrich with circuit breaker
- Identity Workbench UI: photo gallery, lock status gauge, moniker table
- Progressive report streaming of deep profiles
- Evaluation harness scripts (precision on fixtures)

### Phase 2 - Production · 3 - 4 weeks
- RIS Playwright runners (Yandex/Google) with cache
- Optional local face embedding plugin
- Graph visualization in client
- Resume-from-checkpoint store
- Expanded ground-truth (≥15 fixtures)
- Performance: probe concurrency pools, dossier incremental build

### Phase 3 - Pro polish
- PDF redesign with portrait gallery
- MCP 25+ complete
- Desktop auto-update channel
- Operator playbooks per case type (LE, corporate, journalism)

---

## Effort & risk

| Workstream | Effort | Risk | Mitigation |
|------------|--------|------|------------|
| Moniker engine | S | Low | Pure functions + unit tests |
| Deep profile | M | Medium (bots) | API-first, OG fallback, captcha detect |
| Portrait quality | S | Low | Heuristics + golden fixtures |
| RIS | L | High (captcha) | Optional phase; dork fallback |
| Multi-signal lock | M | Medium (false lock) | Strict gate; operator override |
| UI Workbench | M | Low | Incremental React panels |
| Eval harness | M | Medium | Start with synthetic fixtures |

---

## Priority order for code merge

1. Portrait quality (stops logo pollution immediately)
2. Identity lock honesty (score/tier alignment)
3. Moniker engine
4. Deep profile enrich for API platforms
5. Public-record dorks
6. Reverse-image builders
7. MCP + docs
8. UI surfaces (Phase 1)

---

## Definition of done (v6.0.0 release)

- [ ] Unit tests ≥ 120
- [ ] Validation suite documents Dustin-class: no false lock without faces/content
- [ ] Zero platform logos in default Subject Gallery on regression fixture
- [ ] MCP ≥ 18 tools documented
- [ ] Desktop installer builds
- [ ] Operator guide reviewed
- [ ] CHANGELOG + migration published
