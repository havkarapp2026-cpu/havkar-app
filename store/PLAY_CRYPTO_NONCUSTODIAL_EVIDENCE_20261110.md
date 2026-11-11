# Technical evidence — HAVKAR external Stellar wallet architecture

Date: 2026-11-10  
Purpose: Google Play Financial features / crypto-wallet questionnaire support  
**Not legal advice. Not a CASP/MiCA exemption claim.**

Official Play sources used:

```
https://support.google.com/googleplay/android-developer/answer/16329703?hl=en
```

```
https://support.google.com/googleplay/android-developer/answer/13849271?hl=en
```

```
https://support.google.com/googleplay/android-developer/answer/13607354?hl=en
```

## 1. Architecture summary (code-verified)

HAVKAR does **not** implement an in-app custodial crypto wallet.  
The Android app is a WebView shell that loads `https://havkar.online/`.  
Browser/WebView JS connects to **external self-custodial Stellar wallets** through `@creit.tech/stellar-wallets-kit`, asks the user to approve signatures in that wallet, then submits / verifies the signed transaction.

| Capability | HAVKAR does this? | Evidence |
| --- | --- | --- |
| Create end-user wallets / `Keypair.random` | **No** | `stellar-wallet-source.js` uses `Keypair.fromPublicKey` only (signature check) |
| Store seed / mnemonic / secret key | **No** | UI copy + validation reject secret/seed/mnemonic; ownership APIs refuse secrets |
| Hold customer assets in HAVKAR-controlled user wallets | **No** | State holds public `address` only (`HAVKAR_STELLAR`) |
| Sign on behalf of the customer | **No** | `StellarWalletsKit.signTransaction(prepared.xdr, …)` |
| Crypto exchange / order book / trade rail | **No** | `flow === "trade"` → `TRADE_UNCHANGED` in `lib/stellar-checkout.cjs` |
| Android native key storage | **No** | `MainActivity.kt` / `HavkarLinks.kt` — WebView + allowlist only |

## 2. External wallet connectors actually wired

From `stellar-wallet-source.js`:

- `StellarWalletsKit.init({ modules: [ ...defaultModules(), new WalletConnectModule(...) ] })`
- Default network preference: **Testnet** (`readStoredNetwork()` → `"TESTNET"`)

`defaultModules()` from `@creit.tech/stellar-wallets-kit@2.6.0` includes external wallets such as:

- Albedo
- Freighter
- LOBSTR
- Rabet
- xBull
- Hana
- Fordefi
- Klever
- OneKey
- Bitget
- Cactus Link
- D'CENT
- Scopuly

Plus HAVKAR adds **WalletConnect** (`WalletConnectModule`) for Testnet + Public chains.

Therefore: HAVKAR is **not limited to Albedo + WalletConnect only**, but every wired path is an **external wallet connector**. HAVKAR does not ship a HAVKAR-generated custodial keystore for buyers.

## 3. Payment / settlement posture (still gated)

| Gate | Status (production observed 2026-11-10) |
| --- | --- |
| Card / Pi live collection | `paused` (`HAVKAR_REAL_PAYMENTS_ENABLED=false`) |
| Stripe webhook unsigned POST | `REAL_PAYMENTS_PAUSED` |
| Stellar Mainnet payments flag | armed (`HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true`) |
| Customer Mainnet LIVE_COLLECTION | **OFF** unless exact `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION=true` |
| Preferred settlement model | `direct_split` (buyer-signed atomic merchant + fee payments) |
| Legacy fallback | `platform_collect` may still exist for some flows — counsel-relevant |

## 4. What this does **not** prove

- Does **not** prove HAVKAR is outside MiCA CASP.
- Does **not** prove Play “non-custodial software wallet” Additional Option may be selected without counsel.
- Does **not** authorize EU/UK/US/etc. distribution of crypto features without Owner + counsel decisions.
- Does **not** authorize enabling LIVE_COLLECTION or submitting Console declarations.

## 5. Repo paths for reviewers

- `stellar-wallet-source.js` — connect / prepare XDR / external sign / verify
- `wallet.html` — seller receive public-key onboarding; non-custodial copy
- `lib/stellar-checkout.cjs` — quote, geo gate, LIVE_COLLECTION, settlement verify
- `lib/stellar-settlement-models.cjs` — `direct_split` / `platform_collect`
- `lib/crypto-geo-policy.cjs` — geo enforcement (default **OFF** until Owner)
- `android/app/src/main/java/online/havkar/app/MainActivity.kt` — WebView shell
- `store/PLAY_FINANCIAL_FEATURES.md` — Financial features checkbox draft
- `store/EU_CRYPTO_DECLARATION_OPTIONS_20261110.md` — EU Additional Options A/B/C
