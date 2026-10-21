# SCF #46 readiness notes

These notes record what was checked in the repository and on Horizon. They are not an SCF submission.

## Verified Mainnet transaction

Read from `https://horizon.stellar.org` on 2026-10-20:

| Field | Value |
| --- | --- |
| Hash | `31b7592078ec91730b417c920d8f63cf77613f49be1e5d60baf2dec7f2e9ce76` |
| Successful | true |
| Ledger | 65040002 |
| Created | 2026-10-20T08:43:13Z |
| Source | `GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM` |
| Destination | `GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L` |
| Type | payment |
| Asset | native |
| Amount | 1.0000000 XLM |
| Fee | 100 stroops |
| Operations | 1 |

## What the code shows

Stellar payment code lives in `stellar-wallet-source.js` and is loaded by `wallet.html`. Delivery and market pages do not reference Stellar. The euro ledger lives in `havkar-wallet.js` and the `wallets` tables.

The language registry in `havkar-i18n.js` includes English, Persian, Arabic, Urdu, Kurdish Sorani, Kurdish Kurmanji, and the other codes in that file. Translation calls `/api/translate`. Google credentials are described there as server-side.

## What was not changed

This review did not change Mainnet payment controls, Supabase data, billing, or production deployment.
