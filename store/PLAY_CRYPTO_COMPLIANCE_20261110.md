# Google Play crypto / financial documentation — HAVKAR (10 November 2026)

Evidence-oriented. This is **not** legal advice. Unresolved licensing determinations are flagged for qualified counsel.

## What HAVKAR ships (technical facts)

| Fact | Evidence |
| --- | --- |
| Noncustodial Stellar XLM checkout | Client wallet signs; server verifies Horizon; no seed/secret stored server-side for end users |
| Flows | marketplace, services, events (one-time only) |
| Fees in code | marketplace 2% buyer + 3% seller; services 10% commission; events ticket fulfillment path |
| Mainnet customer live collection | Gated by `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` (default OFF) |
| Stripe / Pi live customer charging | Kept OFF / not activated in this release work |
| Google Play Billing / Apple IAP | Required for digital subscriptions / entitlements; XLM recurring refused in code |

## Google Play primary sources (consult current Console text)

1. **Financial features** — Play Console declarations for crypto exchange, wallet, mining, deposits, etc. HAVKAR must declare the **crypto wallet / crypto transactions** surfaces that match the shipped WebView behavior (noncustodial send/receive via external wallets), not invent a custodial exchange.
2. **Restricted financial products** — Crypto apps may need country targeting restrictions, additional questionnaires, and/or licensing proofs depending on feature set.
3. **Data safety** — Align with `store/PLAY_DATA_SAFETY.md`; financial info / payment data categories must match actual collection.
4. **EU / EEA distribution** — Google may require crypto providers to confirm MiCA readiness or restrict distribution. Treat Console prompts as authoritative for the submission date.

Primary documentation entry points (Owner must open current versions in Play Console / Google Play policy center):

```
https://support.google.com/googleplay/android-developer/answer/9876931
```

```
https://support.google.com/googleplay/android-developer/answer/13805821
```

```
https://support.google.com/googleplay/android-developer/answer/13392821
```

(If a URL redirects, follow the live Play Policy Center article for “Financial features” / “Cryptocurrency”.)

## MiCA / CASP (EU) — jurisdiction note (counsel required)

| Question | Technical observation | Legal status |
| --- | --- | --- |
| Does HAVKAR custody user XLM? | No — users sign with their own wallet; HAVKAR destination is a platform receive address for checkout settlement | **Not a legal determination** |
| Is HAVKAR a CASP under MiCA? | Depends on whether the activity is “crypto-asset service” (custody, exchange, transfer on behalf of clients, advice, etc.) as interpreted for a marketplace that settles in XLM | **UNRESOLVED — counsel** |
| Noncustodial wallet UX alone | Often discussed as outside custody CASP, but marketplace settlement, fee collection, and “receiving on behalf of sellers” can still trigger licensing | **UNRESOLVED — counsel** |
| Country-specific licenses (IT, DE, FR, etc.) | May pre-exist or coexist with MiCA transitional rules | **UNRESOLVED — counsel** |

**Owner action:** Retain EU crypto/financial counsel before enabling Mainnet live customer collection and before worldwide Play distribution that includes crypto checkout.

## HAVKAR Console declaration draft (Owner must verify against shipped AAB)

- Crypto exchange: **No** (no order book / swap product as Trade XLM checkout)
- Crypto wallet (noncustodial facilitation): **Yes** if WebView exposes connect/sign/send
- Crypto mining: **No**
- Deposits / withdrawals of fiat to crypto brokerage: **No** (unless later added)
- Financial services license upload: only if counsel/regulator determines required

Never fabricate licenses or 14-day closed-test results.

## Alignment checklist before Play crypto submission

1. Signed AAB package/version matches Data Safety + Financial features answers.
2. Account deletion and privacy URLs live on canonical HTTPS host.
3. Mainnet live collection remains OFF until Owner + legal clearance + Production deploy.
4. No secret keys in APK/AAB assets or source.
5. Counsel memo filed for MiCA/CASP and IT distribution.

## Server-side geo control (implemented, Production OFF by default)

| Env | Effect |
| --- | --- |
| `HAVKAR_CRYPTO_GEO_ENFORCEMENT=true` | Enables server refusal of XLM quote/settle for restricted countries |
| `HAVKAR_CRYPTO_GEO_PRESET=eu_eea` (default preset) | Deny-list EU+EEA ISO2 |
| `HAVKAR_CRYPTO_GEO_PRESET=play_listed` | Deny-list Play crypto-form countries |
| `HAVKAR_CRYPTO_RESTRICTED_COUNTRIES` | Custom deny-list override |
| `HAVKAR_CRYPTO_GEO_MODE=allow_list` + `HAVKAR_CRYPTO_ALLOWED_COUNTRIES` | Allow-list mode |
| `HAVKAR_CRYPTO_GEO_UNCERTAIN=deny` (default) | Missing/VPN-uncertain geo → refuse crypto |
| `HAVKAR_CRYPTO_GEO_TRUST_CLIENT_HEADER` | Default off — blocks client spoof bypass |

See also: `store/EU_CRYPTO_DECLARATION_OPTIONS_20261110.md`, `store/PLAY_CRYPTO_COUNTRY_MATRIX_20261110.md`.
