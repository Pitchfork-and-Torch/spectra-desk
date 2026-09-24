# Migration: Spectra Desk v5.1.0 → v6.0.0 (Dossier Engine)

## Breaking / behavioral changes

| Area | v5.1 | v6.0 |
|------|------|------|
| Disambiguation score | Could reach 90+ on structural signals alone | **Capped ~58** without content/faces |
| Investigator tier | Decoupled from score | Driven by **identityLock.status** |
| Portraits | YouTube logos entered gallery | **Logo/non-face gate** rejects them |
| Username probes | Existence-only "verified" | Existence kept; **deepProfiles** for content |
| MCP tools | 10 | **19+** (moniker, RIS, lock, deep profile, ...) |
| Engine version | 5.1.0 | **6.0.0** |
| Case store | Compatible | Additive fields on report JSON |

## Report JSON additive fields

```json
{
  "monikerInventory": [],
  "deepProfiles": [],
  "identityLock": { "status": "insufficient", "score": 0 },
  "reverseImageQueries": []
}
```

Old cases open fine; new fields appear on fresh runs.

## Upgrade steps

```bash
cd spectra-desk
git pull
npm run install:all
npx playwright install chromium --prefix server
npm test --prefix server
npm run build
# Desktop
npm run dist:win
```

## MCP clients

Update tool allowlists to include:

- `discover_monikers`, `enrich_profile`, `get_identity_lock`
- `reverse_image_search`, `filter_portraits`, `public_record_dorks`
- `get_moniker_inventory`, `get_deep_profiles`, `get_reverse_image_pack`

## Operator expectations

- High score **without** lock is no longer possible via structural-only bonuses.
- "38 verified probes" no longer inflate attribution - check `deepProfiles[].hasContent`.
- Supply **reference photo** + **email/username** for best lock rates.

Public sources only · Investigative lead - not legal proof of identity.
