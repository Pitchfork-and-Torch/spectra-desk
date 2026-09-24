# Operator Guide - Spectra Desk v6 Dossier Engine

## Mission

Produce a **visually and content-corroborated** subject dossier from public sources, with explicit lock status and next actions.

## End-to-end workflow

### 1. Intake (minimum viable)

| Field | Why |
|-------|-----|
| First + Last | Required |
| City / State | Homonym division |
| Email | Gravatar, registration pivots |
| Username | Deep profile path |
| Employer / website | Anchor corroboration |
| **Reference photo** | Visual identity lock |
| Notes (`aka ...`) | Moniker seed |

### 2. Run modes

| Mode | Use |
|------|-----|
| `fast` | Triage |
| `full` | Operational dossier |
| `validation` | Ground-truth / CI |

### 3. While running - what to watch

1. **Moniker inventory** - expanded handles beyond dotted forms  
2. **Deep profiles** - bios/avatars/locations (not HTTP-only)  
3. **Portrait gallery** - logos should be **absent**  
4. **Identity lock** - `insufficient | possible | probable | locked`  
5. **Next actions** - concrete follow-ups  

### 4. Identity Workbench

1. Open **Identity Workbench** after run.  
2. Review ranked candidates (LinkedIn pivot is **not** a locked profile).  
3. Open reverse-image query pack for any real face photos.  
4. **Confirm TARGET** only when multiple independent signals agree.  
5. Mark wrong candidates → feeds negative-signal learning.  
6. Assign portraits: subject / homonym / reject.  

### 5. Lock criteria (operator checklist)

Lock only if **≥2** of:

- [ ] Face match to reference or consistent multi-source face cluster  
- [ ] Content-attributed account (bio/name/location)  
- [ ] Unique handle + name co-occurrence in public text  
- [ ] Employment or public-record full-name hit with location  

**Never lock** on: uncommon surname + noise filter + LinkedIn directory alone.

### 6. Export & custody

- HTML + PDF for case file  
- `MANIFEST.json` SHA-256 for evidence integrity  
- JSON report for automation / MCP  

### 7. Dustin-class lesson

Case `spectra-2f504cf9` showed score 94 with **insufficient** tier: 38 HTTP probes + YouTube logos + LinkedIn pivot.  

v6 response:

- Score capped without content/faces  
- Logos rejected  
- Deep enrich + monikers + public-record dorks  
- Explicit next actions (email, reference photo, manual LI confirm)  

### 8. Ethical banner

> Public sources only. Investigative lead - **not** legal proof of identity.  
> Confirm through authorized channels before operational use.

## CLI quick path

```bash
npm run cli --prefix server -- investigate \
  --first Dustin --last Daprizio --city Tampa --state FL --mode full
npm run cli --prefix server -- show spectra-xxxxxxxx
```

## MCP quick path

```
discover_monikers → investigate_subject → get_identity_lock
→ get_deep_profiles → get_reverse_image_pack → confirm_identity
```
