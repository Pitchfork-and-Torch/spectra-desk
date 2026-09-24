# Spectra Desk — Architecture (v5.1.0)

## Overview

Spectra Desk is a local-first OSINT investigation console. A React SPA (or Electron desktop shell, or MCP client) sends subject intake to a Hono API, which orchestrates a multi-phase intelligence pipeline and persists evidence with SHA-256 chain of custody.

```mermaid
flowchart TB
  subgraph client [Client - React 19 / Electron]
    Intake[IntakeForm]
    Progress[ProgressPanel]
    Viewer[ReportViewer]
    Workbench[IdentityWorkbench]
    Portraits[PortraitDisambiguation]
  end

  subgraph api [API - Hono / MCP]
    Health[/api/health]
    Stream[/api/investigate/stream]
    Refine[/api/reports/:id/refine]
    Confirm[/api/reports/:id/identity/confirm]
    Manifest[/api/reports/:id/manifest]
    MCP[spectra-mcp stdio]
  end

  subgraph engine [SpectraEngine v5]
    Probe[Username Probe]
    GitHub[GitHub API]
    Domain[Domain/RDAP]
    Search[Parallel Search]
    Filter[Homonym Filter]
    Score[Disambiguation]
    Candidates[Candidate Profiles]
    Dossier[Subject Dossier]
    PortraitsE[Portrait Intel]
    Brief[Investigator Brief]
  end

  subgraph storage [Local Storage]
    JSON[~/.spectra-desk/*.json]
    Cases[~/.spectra-desk/cases/]
    Cache[~/.spectra-desk/search-cache/]
    PortraitsDir[~/.spectra-desk/cases/id/portraits/]
  end

  Intake --> Stream
  Stream --> engine
  engine --> storage
  Viewer --> Manifest
  Workbench --> Confirm
  MCP --> engine
```

## Pipeline phases

| Phase | Module | Method |
|-------|--------|--------|
| Wikipedia | `wikipedia.ts` | REST API |
| Username probe | `username-probe.ts` + `sherlock-sites.ts` | API + HTTP grid |
| GitHub | `github.ts` | REST API |
| Domain | `domain.ts` | RDAP + fetch + Wayback |
| Web search | `browser.ts` / `search-external.ts` | Playwright + HTTP engines |
| Enrichment | `enrich.ts` | Anchor scoring + homonym filter |
| Social | `social.ts` | Pattern + verification |
| Email | `email.ts` / `email-registration.ts` | Gravatar, MX, holehe-style probes, HIBP |
| Portraits | `portrait-collector.ts` / `portrait-intel.ts` | Public images + dHash |
| Capture | `browser.ts` | Page text archive |
| Disambiguation | `disambiguate.ts` | Explainable score breakdown |
| Candidates | `candidate-profiles.ts` | Identity Workbench profiles |
| Dossier | `dossier.ts` | Narrative identity brief |
| Media | `media-timeline.ts` | Chronological press/media |
| Correlation | `account-correlation.ts` | Cross-platform metadata |
| Custody | `chain-of-custody.ts` | SHA-256 manifest |
| Graph | `identity-graph.ts` | Person/account/domain edges |
| Report | `report-html.ts` / `report-pdf.ts` | HTML + PDF |

## Query modes

| Mode | Queries | Use case |
|------|---------|----------|
| `full` | 24 | Production investigations |
| `fast` | 12 | Balanced speed/depth |
| `validation` | 8 | Ground-truth CI/manual |

## Entry points

- **Web UI:** `npm run dev` → :5173 (proxies API)
- **API:** `npm run start --prefix server` → :3847
- **Desktop:** `npm run desktop:dev` / `npm run dist:win`
- **CLI:** `npm run cli --prefix server -- investigate --first John --last Doe --username johndoe --employer example.com`
- **MCP:** `npm run mcp --prefix server` (10 tools including workbench + dossier)
- **Docker:** `docker compose up`

## Testing strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | ~80 tests — anchors, homonym, disambiguate, portraits, dossier, MCP surface |
| Smoke | test-run.ts | Engine instantiation |
| E2E validation | run-validation.ts | 6 ground-truth fixtures (manual/nightly) |

## Ethics boundary

Public sources only. No authenticated scraping. Investigative leads — not legal proof of identity.