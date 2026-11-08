# HAVKAR — Production activation status (8 November 2026, owner auth update)

Owner authorized **preparation and activation after verified eligibility**.  
This supersedes the earlier blanket ban on preparing production payments, but **does not** authorize fabricated approvals, secret exposure, or irreversible charges without a separate exact-amount confirmation.

## Actually activated now

| Rail | Activated? | Evidence |
| --- | --- | --- |
| Stripe live customer collection | **NO** | MCP shows only sandbox `HAVKAR-sandlåda` (`livemode=false`); prod status `paused` |
| Stripe sandbox engineering | usable for tests | Sandbox `charges_enabled=true`, `payouts_enabled=true` |
| Pi | **NO** | Individually disabled |
| Trade | **NO** | Individually disabled |
| Stellar Mainnet payments | **NO** | Source `STELLAR_MAINNET_PAYMENTS_ENABLED = false` |
| Stellar Testnet quote/verify | plumbing ON | Destination configured; no irreversible Mainnet |
| Google Play production worldwide | **NO** | Closed testing / 12+14 rules not claimed complete |

## GREEN — production-ready plumbing (not the same as activated)

- Per-provider gates in `lib/real-payments.cjs` (Stripe / Pi / Trade)
- Pause + live-secret double gate for Stripe
- EUR/USD allow-list; event tickets remain EUR-priced
- Checkout idempotency + dynamic payment methods (still behind pause)
- Commission 10% / marketplace fees preserved
- Ads + business verification migrations on prod
- SCF #46 draft + Horizon evidence package (deadline **9 Nov 2026**)
- Android worldwide closed-testing checklist (`store/ANDROID_WORLDWIDE_RELEASE.md`)
- Stripe sandbox audit (`store/STRIPE_ACCOUNT_AUDIT_20261108.md`)

## YELLOW — blocked pending owner / provider

1. Connect **live** Stripe account to Stripe MCP / Dashboard verification  
2. Configure live webhook endpoint to production URL  
3. Confirm Vercel secret key mode; set live flags only after that  
4. Separate confirmation for first exact live charge amount  
5. Stellar Mainnet checklist (separate)  
6. Play Console: AAB upload, ≥12 testers, ≥14 days, countries, Data safety paste  
7. SCF external submit before 9 Nov 2026 (owner only)

## RED — confirmed gaps

- Live Stripe eligibility **not verified** (sandbox only in MCP)
- Sandbox has **zero** webhook endpoints configured
- Production collection remains `REAL_PAYMENTS_PAUSED`
- Business app `#1` still needs genuine VAT/docs + independent reviewer
EOF
