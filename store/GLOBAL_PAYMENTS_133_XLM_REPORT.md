# HAVKAR Global 133 Currencies + XLM — Architecture & Compliance Report

**Status:** Architecture implemented and Owner-gated. New live payment routes are **NOT** activated.
**Settlement currency (Stripe):** EUR (Italian Stripe account → Revolut Business).
**XLM settlement:** On-ledger native XLM only. Stripe does **not** settle XLM.

## A. Exact list of 133 supported presentment currencies

Source of truth: `lib/stripe-supported-currencies-60.cjs` (`PRESENTMENT_COUNT === 133`) and `havkar-presentment-currencies.js`.

Verified against Stripe presentment documentation: https://docs.stripe.com/currencies

Exact codes exported by `listStripePresentmentCurrencies()` (count verified = 133):

```
usd, aed, afn, all, amd, ang, aoa, ars, aud, awg, azn, bam, bbd, bdt, bif,
bmd, bnd, bob, brl, bsd, bwp, byn, bzd, cad, cdf, chf, clp, cny, cop, crc,
cve, czk, djf, dkk, dop, dzd, egp, etb, eur, fjd, fkp, gbp, gel, gip, gmd,
gnf, gtq, gyd, hkd, hnl, htg, huf, idr, ils, inr, isk, jmd, jpy, kes, kgs,
khr, kmf, krw, kyd, kzt, lak, lbp, lkr, lrd, lsl, mad, mdl, mga, mkd, mmk,
mnt, mop, mur, mvr, mwk, mxn, myr, mzn, nad, ngn, nio, nok, npr, nzd, pab,
pen, pgk, php, pkr, pln, pyg, qar, ron, rsd, rub, rwf, sar, sbd, scr, sek,
sgd, shp, sle, sos, srd, szl, thb, tjs, top, try, ttd, twd, tzs, uah, ugx,
uyu, uzs, vnd, vuv, wst, xaf, xcd, xcg, xof, xpf, yer, zar, zmw
```

Zero-decimal presentment codes in this registry: bif, clp, djf, gnf, jpy, kmf, krw, mga, pyg, rwf, vnd, vuv, xaf, xof, xpf.
Special two-decimal-zero API encoding: isk, ugx.
Note: Frankfurter/ECB may not return rates for every presentment code; missing rates refuse the quote (`fx_rate_missing`) instead of inventing a number.

## B. Currency support matrix by payment provider

| Provider | Role | Currencies | Live gate |
|---|---|---|---|
| Stripe presentment | Charge/display fiat | 133 ISO codes above | `HAVKAR_REAL_PAYMENTS_ENABLED` + `HAVKAR_STRIPE_LIVE_ENABLED` (sk_live) |
| Stripe settlement | Platform receive | EUR | Same + connected bank |
| Revolut Business | EUR bank settlement | EUR | Owner banking; IBAN never public |
| Frankfurter / ECB | FX quotes only | ECB-covered set (subset of 133) | Quote-only; missing rate → refuse |
| Stellar XLM | Crypto payment | Native XLM only | `HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED` + live collection flag + funded destination |
| Duffel flights | Partner booking | Blocked until Duffel live ready | Not activated |

**Display vs charge vs settlement**
- Display currency = buyer-selected presentment code
- Charge currency = Stripe Checkout / PaymentIntent currency (same presentment code when quoting Stripe)
- Settlement currency = EUR for Stripe; on-ledger XLM for Stellar

## C. XLM integration status by paid module

| Module | XLM flow id | Implementation | Live |
|---|---|---|---|
| Buy & Sell | `marketplace` | Implemented (gated) | Owner flags only |
| Services | `services` | Implemented (10% / 1000 bps) | Owner flags only |
| Events / Tickets | `events` | Implemented (gated) | Owner flags only |
| Ads | `ads` | Quote path implemented | Owner flags only |
| Jobs ordinary listing | `jobs_listing` | Prepaid one-time quote | Owner flags only |
| Jobs corporate sub | — | Stripe subscription only; XLM recurring refused | Not XLM |
| Business listing | `business_listing` | Prepaid one-time quote | Owner flags only |
| HAVKAR AI credits | `ai_credits` | PLUS 7.99 / PRO 14.99 / BUSINESS 29.99 EUR packs | Owner flags only |
| Flights | `flights` | Catalog blocked pending Duffel live | Blocked |
| Omio rail | — | External partner | N/A |
| Trade exchange | — | Refused | Refused |

Automatic recurring XLM debits are **not** supported.

## D. Existing payment functionality preserved

- Existing Stripe webhook processor, Connect marketplace helpers, Owner EUR1 gates, stellar ownership / mainnet ownership, XLM invoice verify, payment activation status, currency-matrix quote API remain.
- `refuseLiveCheckout` refuses `global_live_checkout` unless method-specific live gates are armed.
- No production payment env flags were changed by this work.
- No Owner wallet destination or IBAN changes.

## E. Stripe and Stellar test results

See CI / local `node --test` run in the PR notes. Live card charges and Mainnet XLM transfers were **not** executed (Owner approval required).

## F. Security and regulatory blockers (IT/EU)

1. **MiCA / crypto-asset services:** Accepting XLM as payment for HAVKAR services via non-custodial wallet transfer is distinct from operating a crypto-exchange or custody. Do **not** hold user private keys. Do **not** offer XLM↔fiat exchange as a service.
2. **AML/KYC:** Higher-risk volumes may require enhanced due diligence; keep using licensed rails (Stripe) for fiat where possible.
3. **PSD2:** Card acquiring remains with Stripe (licensed). Do not invent an unlicensed payment institution.
4. **VAT / consumer protection:** Multi-currency presentment must still invoice/settle correctly in EUR books; quote expiry must be enforced.
5. **Stripe ≠ XLM settlement:** Never claim Stripe settles XLM.
6. **Revolut Business:** EUR settlement compatibility assumed via Stripe payouts to Owner bank; IBAN must stay private.
7. **Unresolved before any new live arming:** Owner written approval for each new live module flag; legal review of XLM consumer disclosures; confirm Stripe account country presentment eligibility for every code actually charged (docs list ≠ every account can charge every code).

## G. CI

Recorded in PR after push.

## H. Commit SHA / PR

Filled after push.

## I. Production deployment status

Safe to deploy **catalog + quote + gated orchestration** only. Must not change live payment flags.

## J. Features requiring Owner approval before live activation

1. Arming `HAVKAR_REAL_PAYMENTS_ENABLED` / `HAVKAR_STRIPE_LIVE_ENABLED` for any newly wired module.
2. Arming `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` (or equivalent) for customer Mainnet XLM collection.
3. `HAVKAR_JOB_PAYMENTS_ENABLED`, `HAVKAR_SERVICE_PAYMENTS_ENABLED`, AI credit live charging, ads live charging.
4. Narrowing live Stripe currencies via `HAVKAR_STRIPE_FIAT_CURRENCIES`.
5. Any real-money test charge or Mainnet transfer.
6. Changing Mainnet destination public key or Revolut settlement account.
7. Enabling Duffel live flight orders.

## API surfaces (gated)

- `GET/POST /api/global-payments` → catalog / `global_payment_quote` / refused `global_live_checkout`
- `GET/POST /api/currency-matrix` → matrix + FX quote with source/expiry
- Orchestration helper: `lib/havkar-payment-orchestration.cjs`
