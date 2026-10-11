# Spectra Desk - Ground-Truth Validation

## v9 doctor

```bash
npm run cli --prefix server -- doctor
```

Checks catalog count 898 against the README, case dir, SHA-256, port 3847 or the next free port, Fast cap 12, a DEMO PDF, MCP beat names, CLI help, and counsel-safe redaction. The DEMO subject is Avery Quill, a fictional composite.

The older tables below are historical runs. They are not the v9 gate.

Run: `npm run validate --prefix server`  
**Note:** v2.2 uses `validation` mode (8 queries/fixture) with search cache - suite ~5 - 10 minutes.

## v2.2 results (2026-07-03) - validation mode

| Fixture | Known truth | Score | Homonym risk | Result |
|---------|-------------|-------|--------------|--------|
| Tim Cook + Apple | Employer "Apple" in corpus | 92 | low | PASS |
| Barack Obama + US | Wikipedia title match | 82 | low | PASS |
| Elon Musk + Tesla | Employer "Tesla" in corpus | 96 | low | PASS |
| John Smith + Austin TX | Common name - must flag high homonym risk | 74 | **high** | PASS |
| Satya Nadella + Microsoft | Employer "Microsoft" in corpus | 70 | low | PASS |

**5/5 passed** · ~6 min with search cache warm · 8 queries/fixture

## v2.0 results (2026-07-03)

| Fixture | Score | Homonym risk | Result |
|---------|-------|--------------|--------|
| Tim Cook + Apple | 92 | low | PASS |
| Barack Obama + US | 82 | low | PASS |
| Elon Musk + Tesla | 96 | low | PASS |
| John Smith + Austin TX | 74 | **high** | PASS |
| Satya Nadella + Microsoft | - | - | Pending (stuck on 24-query runs) |

## v1.1 baseline (2026-07-03)

| Fixture | Score | Result |
|---------|-------|--------|
| Tim Cook + Apple | 100 | PASS |
| Barack Obama + US | 89 | PASS |
| Elon Musk + Tesla | 100 | PASS |
| John Smith + Austin TX | 89 | PASS |
| Satya Nadella + Microsoft | 79 | PASS |

## Disambiguation strategy (v2)

1. **Anchors first** - username (+35), domain (+30), email (+40) in hit scoring
2. **Query multiplication** - name variants × site anchors × username permutations
3. **Username probe** - API enrichment before web search
4. **Homonym filter** - exclude entertainment/IMDb/fandom hits without anchor match
5. **Common name penalty** - John Doe, John Smith require anchor corroboration
6. **Investigator tier** - confirmed / likely / uncertain / insufficient
7. **Refine endpoint** - `POST /api/reports/:id/refine` applies Q&A and re-scores