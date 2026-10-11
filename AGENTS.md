# Spectra Desk

Free Windows OSINT desk. Public index search only.

## Rails

- No login bypass, session hijack, cookie replay, or private-account scrape.
- No illegal data-broker APIs. No bundled people-search token.
- No dark-web marketplaces. No live location tracking. No face-match product.
- Investigative lead, not legal proof of identity.
- The machine does not LOCK. LOCKED is a human action in the desk, or `spectra lock <id> --human` typed by the operator. MCP `lock` refuses.
- Cases stay in `%USERPROFILE%\.spectra-desk\`. No cloud case store. No account. No license key.
- Do not commit case folders, captures, `.env`, or `licensing/` secrets.

## Beats

Intake, Divide, Deliver. Fast is the default (cap 12). Full is explicit (cap 28).

## Counts

Toolkit catalog is `server/src/data/toolkit-catalog.json`. Recount after any catalog change. Do not invent the number. Current count: 898.
