# EU / Play crypto declaration options for HAVKAR (10 November 2026)

**Not legal advice. HAVKAR does not hold a MiCA CASP authorisation.** Never declare a license that does not exist.

Primary sources:

```
https://support.google.com/googleplay/android-developer/answer/16329703?hl=en
```

```
https://support.google.com/googleplay/android-developer/answer/13849271?hl=en
```

```
https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng
```

```
https://www.consob.it/web/consob-and-its-activities/w/transitional-period-under-the-mica-regulation-on-crypto-assets-ends-9-entities-authorised-in-italy
```

```
https://www.bancaditalia.it/compiti/vigilanza/accesso-mercato/soggetti-mercato-cripto-attivita/casp/faq-casp/
```

## Technical facts (code-verified)

| Fact | Status |
| --- | --- |
| End-user private keys / seeds stored by HAVKAR | No |
| User signs with external wallet | Yes |
| HAVKAR receives XLM to a merchant destination for checkout | Yes (platform settlement address) |
| Marketplace / services / events one-time XLM | Yes |
| Custodial exchange / order book | No |
| MiCA CASP license held by HAVKAR | **No — never claim** |
| LIVE_COLLECTION Mainnet customer | OFF by default |

## Play Additional Options (mapped to Owner request A/B/C)

### A. Crypto functionality disabled with geoblocking

Play wording (paraphrase of official Additional Option): app does not offer purchase/holding/exchange of cryptocurrencies in the country/region and necessary geo-restriction measures are applied.

| Verdict | **SUPPORTED (technical) / LEGAL REVIEW REQUIRED (sufficiency)** |
| --- | --- |
| Technical | Server-side gate implemented: `HAVKAR_CRYPTO_GEO_ENFORCEMENT` (default **off**). When enabled with preset `eu_eea` or `play_listed`, XLM quote/settle refuses restricted countries; non-crypto features remain. Client country headers are not trusted by default (anti-bypass). Uncertain location fails closed for crypto. |
| Production activation | **Not activated** without Owner approval |
| Legal | Counsel must confirm geo measures + Play Console answers are adequate. Geoblocking alone is **not** claimed here as legally sufficient. |

### B. App qualifies as a self-custodial / non-custodial software wallet

Play wording: confirm the app is a non-custodial software wallet.

| Verdict | **LEGAL REVIEW REQUIRED** (not auto-SUPPORTED) |
| --- | --- |
| Technical overlap | Users keep keys; HAVKAR does not custody seeds. WebView connects external wallets and prepares payments. |
| Gap | HAVKAR is primarily a marketplace that settles in XLM to a platform destination and collects fee economics — not a pure “software wallet product.” MiCA Recital 83 excludes providers of non-custodial wallet **hardware/software**, but marketplace settlement / receiving may still be analysed as other crypto-asset services. |
| Declaration | Owner + counsel only. Agent will not certify option B. |

### C. No local license required / valid authorisation or statutory exemption

Play wording: availability does not require local license/registration or is permitted under a valid statutory exemption; supporting docs + Trust & Safety sub-conditions.

| Verdict | **UNSUPPORTED** to claim today |
| --- | --- |
| Reason | No MiCA CASP authorisation for HAVKAR. No counsel memo / regulator letter on file in this repository. Italian CASP list (Consob/Bank of Italy public communications) does not include HAVKAR. |
| Path | Obtain CASP **or** qualified counsel exemption memo before selecting C. |

## Recommended Play Console answers (evidence-backed drafts only)

| Declaration item | Draft answer | Condition |
| --- | --- | --- |
| Cryptocurrency exchange | **No** | No exchange/order book in shipped XLM checkout |
| Cryptocurrency wallet | **Yes** if connect/sign/send remains in distributed build | Match actual AAB WebView behaviour |
| Financial features form | Must be completed for every app | Official Play requirement |
| EU CASP authorisation upload | **Do not upload fabricated docs** | Only if truly authorised |
| EU Additional Option A | Available after Owner enables server geo + Play country targeting | Counsel review |
| EU Additional Option B | Only if counsel agrees HAVKAR is a non-custodial software wallet for Play purposes | Counsel review |
| EU Additional Option C | Do not select without exemption docs | Unsupported now |

## Italy note

Consob / Banca d’Italia public materials describe CASP authorisation and VASP transitional regimes. HAVKAR is **not** listed among authorised Italian CASPs in the cited Consob joint release. Treat Italian distribution of crypto features as **Legal review required**.
