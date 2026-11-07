# HAVKAR final release status — 7 November 2026

Evidence-based. Items not verified are marked BLOCKED / NOT VERIFIED. Mainnet and `HAVKAR_REAL_PAYMENTS_ENABLED` remain off until owner-controlled checks pass.

## Module scorecard

| Module | Verdict | Evidence / blocker |
| --- | --- | --- |
| Buy & Sell | PASS (code + prod schema catch-up) | `listing_surface` applied on production; marketplace isolation tests; `marketplace.html` redirects to `buy-sell.html` |
| Ads | PASS | Separated via `listing_surface=advertising` |
| Jobs | PASS (code+unit) | `jobs.html` + management tests |
| Services | PASS (code) | Bookings + one-time XLM payAndVerify (Testnet only) |
| Events | PASS (code) | Free tickets; Stripe gated; XLM verify + ticket fulfillment |
| Tickets / Flights | PARTIAL | Live Duffel search wired in `tickets.html`; paid booking still Duffel test-mode / owner-gated |
| Tickets / Train·Bus·Ferry | BLOCKED | Omio partner API not available |
| Tickets / Hotels | BLOCKED | No hotel partner |
| Taxi / Transfer | PASS (intentionally disabled) | Hidden from purchasing; no fake fares |
| Delivery | PASS (protected) | Lifecycle preserved; XLM Testnet settle path wired |
| AI | PASS (gated) | Requires real-payments flag for paid AI |
| Auth / Profiles | PASS / PARTIAL | Auth OK; avatar upload still bucket-gated |
| Messaging | PASS + hardened | Conversation party rewrite blocked in production |
| Notifications | PASS | Realtime notifications page |
| Search / Media / i18n | PASS | Existing tests; video ≤60s constraint applied |
| Wallet / Stellar | PARTIAL | Testnet quote+verify+payAndVerify; Mainnet still disabled in source |
| Stripe / Pi / Trade | PASS (paused) | Require `HAVKAR_REAL_PAYMENTS_ENABLED` (unset in production) |

## Payments gates (must stay closed until owner checklist completes)

| Gate | State |
| --- | --- |
| `STELLAR_MAINNET_PAYMENTS_ENABLED` | `false` in `stellar-wallet-source.js` |
| Server Mainnet | `STELLAR_MAINNET_DISABLED` |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | unset on Vercel production |
| Stripe live | requires `HAVKAR_STRIPE_LIVE_ENABLED` |
| Pi / Trade | flags unset |

Owner must set `HAVKAR_STELLAR_TESTNET_DESTINATION` (or valid public `HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY`) for Testnet settlement on production. No secret seeds are accepted.

## Google Play

| Item | Verdict |
| --- | --- |
| targetSdk / compileSdk 36 | DONE in this branch |
| versionCode / versionName | `2` / `1.0.0` |
| AGP | `8.9.1` |
| Signed AAB | Prior run `42399945850` PASS on main; re-run after merge |
| Data safety / screenshots / closed testing upload | BLOCKED — owner Console |
| Reviewer App Access password paste | BLOCKED — owner-held |

## Apple App Store

| Item | Verdict |
| --- | --- |
| Project / bundle id | PASS |
| Signing / IPA / TestFlight | BLOCKED — macOS, Apple team, certificates |

## Security applied this turn (production)

- Marketplace surface + payment intents + media bucket catch-up
- Conversation party-change trigger
- `wallet_exchanges` client write revoke + FORCE RLS
- `product.html` publishable key aligned to `havkar-supabase-config.js`
- Anon write revoke + private-table anon SELECT revoke + DEFINER EXECUTE tighten (`20261107233000_…`)
- Dropped unused `pg_graphql`; revoked sensitive anon SELECT + client TRUNCATE (`20261107234500_…`)
- GraphQL advisor WARNs cleared (verified via advisors + `/graphql/v1` smoke)

### Security remaining blockers

| Item | Status |
| --- | --- |
| Leaked Password Protection (HIBP) | **BLOCKED** — org Free plan; requires Pro + Auth enable |
| Intentional DEFINER RPCs (`event_interest_counts`, delivery accept/update, `ad_has_blocking_dependencies`) | WARN remains by design |
| Pi auth hardening | Still required before enabling Pi |

## Do not claim

- Mainnet payments live
- Omio train/bus/ferry live
- Play / App Store published
- Full manual E2E of all 15 modules in this turn
