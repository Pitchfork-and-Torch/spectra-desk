# Gap Analysis - Dustin Daprizio (Tampa, FL) · spectra-2f504cf9

**Spectra Desk v5.1.0** · Case generated 2026-07-23 · Validation run (HTTP search)

---

## Case snapshot

| Metric | Value | Investigator meaning |
|--------|-------|----------------------|
| Disambiguation score | **94/100** | Looks strong on paper |
| Investigator tier | **insufficient** | Correct operational call |
| Homonym risk | medium | Residual collision risk |
| Identity Workbench | 1 candidate (LinkedIn `/pub/dir` pivot) | Not locked |
| Username probes | 42 total · **38 "exists"** | Nearly all HTTP HEAD only |
| Scored accounts | 38 · **quarantined ~9% posterior** | Existence ≠ attribution |
| Portraits | 3 · **all YouTube/Google logos** | Zero subject faces |
| Search hits retained | 6 | Thin corpus |
| Excluded hits | 3 comics/fandom | First-name filter worked |
| Email / phone / employer | none | No contact surface |
| Evidence items | 54 · SHA-256 OK | Custody strong; content weak |
| Manifest | `e5c13698...` | Immutable archive works |

### Executive contradiction

v5.1 produced a **high numeric score** from:

- uncommon surname (+8)
- noise filtered (+10)
- LinkedIn pivot present (+10)
- location in corpus (+8)
- 10 "verified" profiles (+12) - mostly false-positive HTTP probes

...while the **dossier correctly said insufficient** because no photo, no attributed social, no employment, and no multi-signal lock.

**v6 must align score, tier, and lock status** so "94 + insufficient" cannot happen without explicit "structural score only" labeling.

---

## Gap → v6 requirement matrix

| # | Observed failure | Root cause in v5.1 | v6 capability |
|---|------------------|--------------------|---------------|
| G1 | 38 probes all quarantined 9% | `probeHead` only - no bio/photo/location | **Deep profile extractor** |
| G2 | Only exact + dotted monikers | `deriveUsernames` is shallow | **Moniker / alias engine** |
| G3 | Portraits = YouTube logos | No face/logo quality gate; og:image spam | **Portrait quality + RIS** |
| G4 | No visual lock | No anchor photo; dHash unused on faces | **Face cluster + identity lock** |
| G5 | LinkedIn authwalled | Pivot URL is not a profile | **Public pivot tree + people-search dorks** |
| G6 | Weak graph | Graph built from thin probes | **Association graph from content** |
| G7 | Score inflated | Structural bonuses without content | **Multi-signal scorer + lock gate** |
| G8 | MMA/news public hits underused | Search corpus unstable; not fused | **Public-record dorks + media fusion** |
| G9 | No next-action depth | Generic "add email" | **Action planner from gaps** |
| G10 | MCP has 10 tools | No alias/RIS/lock tools | **25+ MCP tools** |

---

## What v5.1 got right (preserve)

1. First-name entertainment collision filter (comics / Stranger Things).
2. Bing/Google redirect unwrap.
3. LinkedIn professional pivot when `site:linkedin` is empty.
4. SHA-256 per-item + MANIFEST chain of custody.
5. Homonym exclusion persistence (negative signals).
6. Multi-surface product (Electron / CLI / MCP / HTML+PDF).

---

## Success criteria for this case under v6

| Outcome | Pass condition |
|---------|----------------|
| Portraits | 0 platform logos in Subject Gallery; logos quarantined as `non-face` |
| Probes | ≥1 platform with **content extraction** (bio/location/photo) if public |
| Monikers | Alias inventory lists `dustindaprizio`, dotted forms, middle-initial, leet variants |
| Score honesty | If no face + no attributed account → tier ≤ **possible**, lock = false, score capped |
| Public pivots | Explicit LE/public-record dorks for FL (sunbiz, courts, news) as leads |
| Dossier | Status `insufficient` **or** `possible` with concrete next actions (email, anchor photo, confirm LI) |
| Custody | Every new evidence type hashed in MANIFEST |

---

## Non-goals (ethical / legal)

- No authenticated LinkedIn/Instagram scraping.
- No credential stuffing, no private API keys for people-search brokers.
- No claim of legal identity proof.
- Reverse-image via **public search UIs / open endpoints** only; document reliability.

Public sources only · Investigative lead - not legal proof of identity.
