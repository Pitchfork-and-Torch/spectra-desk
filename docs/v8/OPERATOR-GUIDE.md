# Spectra Desk v8 - Operator Guide (Client Dossier Mode)

## What changed for operators

1. **Primary PDF/HTML is client-ready** - executive summary, business profile, life timeline, high-confidence accounts only.
2. **Username probes are internal** - existence-only hits no longer fill the main report.
3. **Business fusion** - Sunbiz / BBB / company About / interviews fuse into employment with real org names.
4. **Life arc** - multi-stage careers (e.g. sports → military → Florida business) are clustered, not split as automatic homonyms.
5. **Workbench still required for LOCKED** - confirm TARGET when operational certainty is required.

## Running an investigation

```bash
npm run cli --prefix server -- investigate --first Dustin --last Daprizio --city Tampa --state FL --mode full
```

Or GUI: `npm run dev` → New investigation.

## Client vs investigator data

| Deliverable | Content |
|-------------|---------|
| `REPORT.html` / PDF | Client brief (v8) |
| `report.clientMarkdown` | Same structure as MD |
| `report.usernameProbes` | Full probe list (API/MCP/Workbench) |
| `report.attributionGate` | Main vs appendix counts |
| `report.semanticAnalysis` | Life stages, continuity |
| `report.businessEntities` | Fused companies |
| `report.lifeTimeline` | Chronological events |

## Locking identity

1. Review life timeline + business cards in client brief.  
2. Open Identity Workbench → confirm TARGET.  
3. Optional: upload reference photo / assign portraits.  
4. Re-score / regenerate - status becomes **LOCKED** when operator confirms with supporting signals.

## Quality checklist before client handoff

- [ ] Executive summary readable in ≤1 page  
- [ ] No quarantine probe tables in PDF body  
- [ ] Primary employer/business has multi-source rationale  
- [ ] Competing names (relatives, directory noise) demoted or explained  
- [ ] Manifest hash present  
- [ ] Legal disclaimer visible  

Public sources only · Investigative lead - not legal proof of identity.
