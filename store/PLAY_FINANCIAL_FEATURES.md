# Google Play — Finansiella funktioner (Financial features) draft

Source: [Play Console Help — Financial features declaration](https://support.google.com/googleplay/android-developer/answer/13849271) (Swedish labels from `?hl=sv`).

Preparation only. Owner submits in Play Console after counsel review. Evidence snapshot: 10 November 2026.

## Production payment facts used for this table

| Fact | Evidence |
| --- | --- |
| Stripe / Pi public card collection | `paused` (`HAVKAR_REAL_PAYMENTS_ENABLED=false`, `HAVKAR_STRIPE_LIVE_ENABLED=false`) |
| Stripe webhook unsigned POST | `REAL_PAYMENTS_PAUSED` |
| Stellar Mainnet one-time XLM | `armed` (`HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true`) |
| Wallet UI default | Stellar **Testnet**; Pi payment disconnected on Wallet screen |
| Play Billing / StoreKit IAP | **Not implemented** |
| AI paid plans | UI present; buttons call `billingUnavailable()` |
| Crypto trade / exchange rail | Server lists `trade` as unsupported for Stellar |
| Banking / loans / insurance / stocks / NFT | Not present in product |

## Declaration choices

| Swedish option (Play form) | Tick? | Technical reason |
| --- | --- | --- |
| **Appen har inga finansiella funktioner** | **Nej — تیک نزن** | Wallet UI, Stellar connect, XLM settlement, EUR balance labels, and payment gates exist. Certifying “no financial features” would be false. |
| Direktlångivare för privatlån | Nej | No loan origination. |
| Låneförmedlare | Nej | No loan marketplace. |
| Lönedagslån | Nej | Not present. |
| Banktjänster | Nej | No deposit-taking bank product. EUR balance is app ledger UI; deposits/withdrawals are not processed while card rails stay paused. |
| Kreditgräns | Nej | Not present. |
| Intjänade löneökningar | Nej | Not present. |
| Banktjänster för mikrofinansiering | Nej | Not present. |
| **Mobilbetalningar och digitala plånböcker** | **Ja — تیک بزن** | `wallet.html` presents a digital wallet surface (balances, send/receive/exchange UI, Stellar wallet connect). Even with card collection paused, the wallet feature is user-facing. |
| Överföring av pengar och elektroniska tjänster | **Nej (پیش‌فرض)** / **نیازمند بررسی حقوقی** | In-app peer remittance / wire product is not a shipped live rail. If counsel considers Stellar/Pi settlement “money transfer,” revisit before submit. |
| Belöningar، poäng، flygbonuspoäng och andra incitament | Nej | No loyalty/points currency product. |
| Handla nu, betala senare | Nej | No BNPL. |
| **Kryptovalutaplånbok** | **Ja — تیک بزن (اتصال کیف‌پول خارجی؛ غیرحضانتی)** | App connects external Stellar wallets (Albedo/Freighter/LOBSTR/… + WalletConnect) and prepares XLM payments; HAVKAR does not create wallets or collect recovery phrases. Expect Play crypto-wallet country questionnaires. Selecting Play Additional Option “non-custodial software wallet” still needs counsel — HAVKAR is a marketplace connector, not a pure wallet product. Evidence: `store/PLAY_CRYPTO_NONCUSTODIAL_EVIDENCE_20261110.md`. |
| Kryptobörs | **Nej** | Stellar unsupported flows include `trade`. Buy & Sell is goods marketplace UGC, not a crypto exchange. |
| Försäljning/handel/utdelning av tokeniserade digitala tillgångar (NFT) | Nej | No NFT sales/trading feature. |
| Aktiehandel och portföljförvaltning | Nej | Not present. |
| Crowdfunding och skuldsedelsfonder (chit funds) | Nej | Not present. |
| Kreditövervakning och -rapportering | Nej | Not present. |
| Finansrådgivning | Nej | Not present. |
| Försäkring | Nej | Not present. |
| Annat | فقط اگر counsel موردی پیدا کند که در جدول جا نمی‌گیرد | Prefer naming the concrete categories above. |

## Related Play payment policy notes (not the same form)

| Topic | Status for current build |
| --- | --- |
| Google Play Billing required for digital goods / AI subscriptions | **Not armed.** Do not sell digital AI subscriptions via Stripe/XLM inside the Play-distributed app until Play Billing (or an allowed exception) is implemented. |
| Physical goods / physical services / live-event tickets | May use non-Play processors under Play Payments policy §3. Keep declarations honest when those rails go live. |
| Leading users to external digital IAP checkout | Forbidden for digital in-app features while distributed on Play. Keep AI billing buttons unavailable. |

## Owner-only follow-ups

1. Counsel confirms crypto-wallet / digital-wallet ticks for every distribution country.
2. Complete any country-specific crypto licensing questionnaires Play shows after ticking wallet categories.
3. If Owner later disables all crypto + wallet surfaces before first Play upload, regenerate this table before submitting.
4. Do **not** enable Stripe/Pi live collection from this document alone.
