# Field Report: Spectra Desk

**Date:** 2026-07-03  
**Repo:** https://github.com/Pitchfork-and-Torch/spectra-desk  
**Built on:** [aperture-mcp](https://github.com/Pitchfork-and-Torch/aperture-mcp) · [incognito-vpn-mcp](https://github.com/Pitchfork-and-Torch/incognito-vpn-mcp)

---

## The vision

OSINT researchers don't need another bookmark folder. They need **one fire, one report**:

> Enter a name. Get a disambiguated, hyperlinked, archived, sourced intelligence brief.

**Spectra Desk** is that console.

---

## What makes it exceptional

### 1. Single-fire workflow
One form submission triggers the entire pipeline:
- Public web recon (6 query variants from subject data)
- Social footprint mapping
- Email MX + Gravatar + mention search
- Address geocoding (OpenStreetMap)
- Page archival with SHA-256 hashes
- Disambiguation scoring
- Executive brief synthesis

### 2. Disambiguation engine
Homonyms are OSINT's #1 failure mode. Spectra scores 0–100 using:
- Name completeness
- Email anchor (+20)
- Location filter (+15)
- Employer (+10)
- Search hit name-token alignment
- Social corroboration

**Demo result (Tim Cook + Apple + US):** 85/100 — *High confidence — subject likely unique*

### 3. Evidence discipline (from Aperture)
Every capture gets:
- Unique evidence ID
- SHA-256 content hash
- Timestamp
- Archive JSON on disk
- Catalog entry in source inventory

### 4. Beautiful console UI
- Dark grid aesthetic with cyan/violet gradients
- Expandable intake form (name + email → full dossier fields)
- Live SSE progress pipeline
- Tabbed report viewer: Executive · Search · Social · Evidence · Inventory
- One-click HTML export

### 5. Legal by design
- **Public index search only** (Brave + DuckDuckGo)
- **No authenticated scraping**
- **LAN blocked** (inherited pattern)
- **Username patterns marked "possible"** until search confirms
- Footer disclaimer on every screen

---

## Live demo results

**Subject:** Tim Cook, Apple, United States

| Metric | Value |
|--------|-------|
| Disambiguation | 85/100 |
| Search hits | 15 |
| Evidence archived | 18 |
| Social (confirmed) | 0 |
| Social (possible) | 12 |
| Top source | Wikipedia, Apple press |

Report ID: `spectra-066d617b`

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Spectra Desk UI (React + Tailwind)     │
│  Intake → Progress SSE → Report tabs    │
└──────────────────┬──────────────────────┘
                   │ HTTP /api/investigate/stream
┌──────────────────▼──────────────────────┐
│  Hono API Server                        │
│  SpectraEngine orchestrator             │
├─────────────────────────────────────────┤
│  Modules:                               │
│  subject · search · social · email      │
│  address · disambiguate · archive       │
│  report · store                         │
├─────────────────────────────────────────┤
│  Playwright Chromium (incognito)        │
└─────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  ~/.spectra-desk/                       │
│  cases/{id}/REPORT.md + REPORT.html     │
│  cases/{id}/ev-*.json                   │
│  {id}.json + index.json                 │
└─────────────────────────────────────────┘
```

---

## Tool lineage

| Prior tool | What Spectra inherits |
|------------|----------------------|
| incognito-vpn-mcp | Incognito Playwright, VPN detection, LAN block |
| aperture-mcp | Evidence hashing, brief synthesis, case model |
| **Spectra Desk** | GUI + disambiguation + OSINT modules + single-fire UX |

---

## Test checklist

| Check | Status |
|-------|--------|
| Server builds | ✓ |
| Demo investigation (Tim Cook) | ✓ 85/100 disambiguation |
| 15 search hits collected | ✓ |
| 18 evidence items archived | ✓ |
| HTML + Markdown export | ✓ |
| Client builds | ✓ |
| SSE progress stream | ✓ |

---

## Run it

```bash
npm run install:all
cd server && npx playwright install chromium
npm run dev   # from root — API :3847, UI :5173
```

---

## Future roadmap

- [ ] specta-mcp — MCP wrapper so agents can fire investigations
- [ ] PDF export with embedded screenshots
- [ ] Case comparison (subject A vs subject B)
- [ ] Optional VPN/proxy from aperture.json config
- [ ] Have I Been Pwned API integration (with user API key)
- [ ] Entity relationship graph visualization

---

## Conclusion

Spectra Desk is the OSINT report delivery system of the future — not because it hacks anything, but because it **disciplines** the research process: disambiguate, source, archive, brief. One name in. One report out.

*Legitimate research only. Public sources only. Be exceptional.*