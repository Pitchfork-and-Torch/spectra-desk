# Spectra Desk v7 - Toolkit Operator Guide

## When to use Toolkit vs full investigation

| Goal | Use |
|------|-----|
| Full multi-signal dossier, portraits, identity lock | **Investigate** (intake form) |
| Open curated public searches for one email/phone/domain | **Toolkit → Search pack** |
| Scrub PII before ChatGPT/Claude paste | **Toolkit → PII Redactor** |
| Check IBAN offline | **Toolkit → IBAN** |

## Search pack

1. Open **Toolkit** (bottom-right).
2. Paste an indicator: `alice@corp.com`, `+1...`, `example.com`, `@handle`, full name, IP, IBAN.
3. **Resolve pack** - opens a list of ready public URLs.
4. Click **Open** for high-signal tools first (WHOIS, HIBP-style pages, people search, platform lookups).
5. Or browse categories (Domains, Usernames, ...) to see templates.

Investigations also store `toolkitPack` on the report for MCP (`get_toolkit_pack`) and JSON export.

## PII Redactor

1. Paste case text → **Redact**.
2. Copy **only** the redacted text to external AI.
3. Keep the redaction map local (or export CSV via API).
4. Paste AI response → **Restore** to rehydrate placeholders.

Heuristic - always spot-check before external submission.

## IBAN

Enter IBAN with or without spaces. Validation is local mod-97. Use search links only if you need web corroboration.

## MCP quick reference

```
list_toolkit_tools { category: "domains", limit: 20 }
toolkit_pack { indicator: "target@example.com" }
toolkit_pack { firstName: "Jane", lastName: "Doe", city: "Tampa" }
classify_indicator { text: "192.0.2.1\nbob@corp.io" }
redact_pii { text: "..." }
analyze_iban { iban: "GB82WEST12345698765432" }
```

## Refreshing the catalog

If you keep a local Exploratores clone:

```bash
node scripts/import-exploratores-catalog.mjs ~/Exploratores
```

Then rebuild the server.

## OPSEC

- Prefer VPN for external searches (same guidance as Exploratores).
- Toolkit links open third-party sites - your IP and query terms are visible to those operators.
- Public sources only; not legal proof of identity.
