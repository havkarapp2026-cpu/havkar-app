# Legal review package — HAVKAR `direct_split` XLM (10 November 2026)

**Audience:** Owner + qualified EU/IT counsel. **Not legal advice. Not a clearance letter.**

## Technical facts (code-verified)

| Fact | Status | Where |
| --- | --- | --- |
| Customer private keys enter HAVKAR servers | **No** | Client wallet signs |
| HAVKAR holds customer recovery phrases | **No** | Never requested |
| Preferred settlement | `direct_split`: one user-signed native tx with payment to merchant receive key + payment to platform fee key | `lib/stellar-checkout.cjs`, wallet multi-op |
| Legacy settlement | `platform_collect`: single payment to HAVKAR network destination | Fallback when merchant key missing / events |
| Fee economics | Marketplace buyer 2% + seller 3% (platform residual 5%); services 10% | Unchanged |
| Atomicity | Both ops in one Stellar transaction | Wallet prepare/sign |
| Server role | Quote intents, Horizon verify, mark settled | No broadcast of unsigned custodial txs |
| Mainnet customer live | OFF (`HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION`) | Default |

## Questions for counsel (unresolved)

1. Does receiving a **platform fee** in XLM on a HAVKAR-controlled account constitute a MiCA crypto-asset service (e.g. transfer / exchange facilitation / other)?
2. Does marketplace matching + quote generation + Horizon confirmation constitute a regulated service even when the purchase amount goes peer-to-peer to the seller?
3. For Google Play Financial features in EU: is Additional Option **B** (non-custodial software wallet) truthful for HAVKAR’s WebView + external wallet model, or only **A** (geo-disable crypto) / CASP upload?
4. Italian Consob/Bank of Italy expectations for an Italian-registered marketplace offering XLM settlement without CASP authorisation.
5. Apple App Store crypto / IAP interaction for physical goods/services paid in XLM vs digital entitlements.

## Official primary sources

```
https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng
```

```
https://support.google.com/googleplay/android-developer/answer/16329703?hl=en
```

```
https://support.google.com/googleplay/android-developer/answer/13849271?hl=en
```

```
https://www.consob.it/web/consob-and-its-activities/w/transitional-period-under-the-mica-regulation-on-crypto-assets-ends-9-entities-authorised-in-italy
```

```
https://www.bancaditalia.it/compiti/vigilanza/accesso-mercato/soggetti-mercato-cripto-attivita/casp/faq-casp/
```

## Explicit non-claims

- HAVKAR is **not** asserted to be MiCA-exempt.
- HAVKAR is **not** listed as an authorised Italian CASP in public Consob materials cited.
- Geoblocking alone is **not** asserted as legally sufficient without counsel.

## Recommended Owner sequence

1. Counsel memo on questions 1–5 against this architecture.
2. Then choose Play declaration path (A / B / CASP / country targeting).
3. Only then enable Production Mainnet live collection.
