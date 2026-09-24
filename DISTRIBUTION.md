# Spectra Desk - Distribution

## Overview

Spectra Desk is a **free** Windows desktop app (MIT).

1. Download the installer from https://spectradesk.jonbailey.xyz/download or GitHub Releases
2. Run it. No license key.

The Stripe / license-key Worker in `licensing/` is **parked**. Do not charge unless the operator asks.

## GitHub (public MIT)

- **Repo:** https://github.com/Pitchfork-and-Torch/spectra-desk
- **Site:** https://spectradesk.jonbailey.xyz/
- **Releases:** Attach `Spectra-Desk-Setup-*.exe`, `Spectra-Desk-Portable-*.zip`, `SHA256SUMS.txt`, `START-HERE.txt`

## Parked subscription stack (do not enable)

| Component | Path | Role |
|-----------|------|------|
| License API | `licensing/` | Cloudflare Worker — Stripe webhooks, validation |
| Desktop gate | `desktop/src/license.ts` | Activation UI on first launch |
| Payments | Stripe | Monthly recurring price |

### Deploy license server

```bash
cd licensing
npm install
npx wrangler d1 create spectra-licenses
# Paste database_id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_ID
npx wrangler secret put LICENSE_SIGNING_SECRET
npm run deploy
```

### Stripe setup

1. Create a **Product** → recurring **Price** (monthly)
2. Copy Price ID → `STRIPE_PRICE_ID` secret
3. Add webhook endpoint: `https://<worker>/api/webhook/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Optional: Stripe Customer Portal for self-service cancel

Subscribe page: `https://<worker>/subscribe`

## Build release assets

```bash
npm run install:all
npm run dist:win
npm run package:release
```

Output in `dist/release/`:

- `Spectra-Desk-Setup-4.0.0.exe` — installer
- `Spectra-Desk-Portable-4.0.0-win64.zip` — USB-friendly portable
- `SHA256SUMS.txt` — integrity checksums
- `START-HERE.txt` — end-user instructions

### Publish to GitHub Releases

```bash
gh release create v4.0.0-desktop \
  --repo Pitchfork-and-Torch/spectra-desk \
  --title "Spectra Desk v4.0.0 Desktop" \
  --notes "Windows desktop app with monthly subscription licensing." \
  dist/release/*
```

## End-user flow

1. Visit subscribe page → pay monthly
2. Copy license key from success page
3. Download from GitHub Releases (requires repo/release access)
4. Run installer or portable `.exe`
5. Enter email + license key when prompted
6. App re-validates weekly; 7-day offline grace period

## Dev / internal builds

Skip license gate:

```bash
set SPECTRA_LICENSE_SKIP=1
npm run desktop:dev
```

## Publishing checklist

- [ ] Deploy license Worker + D1
- [ ] Configure Stripe product + webhook
- [ ] Code-sign Windows installer (SmartScreen)
- [ ] GitHub Release with all `dist/release/` assets
- [ ] Subscriber onboarding email template
- [ ] Terms of service / acceptable use policy