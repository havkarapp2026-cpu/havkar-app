# Stellar XLM — real-use security / settlement / refund review

Date: 2026-11-21  
Branch: `cursor/buysell-public-ready-d4b2`  
Audience: Owner. Not legal advice. No live Mainnet charge performed.

## Security (code-verified)

| Check | Result |
| --- | --- |
| Customer private keys / seeds enter HAVKAR servers | **No** — client wallet signs |
| Seeds stored in `stellar_receive_accounts` | **Must not** — only public receive keys (wallet UI) |
| Preferred settlement | `direct_split`: one signed tx → seller receive + platform fee |
| Platform-collect for customer marketplace | **Disabled** by default |
| Mainnet customer live gate | `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION` (Owner-only) |

## Settlement

- Server creates quote intents, verifies Horizon, marks settled.
- Merchant must have a funded Mainnet receive account before direct_split quotes succeed.
- Fee math aligned with card: buyer +2%, seller −3% (same rates as `havkar-fee-examples`).

## Refunds (honest gap)

- For `direct_split`, server returns `REFUND_MODEL_UNSUPPORTED`.
- Dual-leg automatic refund verification is **not** enabled.
- A real refund requires the **merchant** to send XLM back (and separately the platform fee recipient if fee should reverse).
- Platform-collect refund path exists in code but customer marketplace platform-collect is disabled — do not treat it as a production refund product.

## Owner actions before real XLM use

1. Counsel review of MiCA/CASP / Play Option B questions (`store/DIRECT_SPLIT_LEGAL_REVIEW_PACKAGE_20261110.md`).
2. Confirm platform fee destination public key on Mainnet (env — never invent).
3. At least one seller registers a receive public key via Wallet and funds the account.
4. Explicit Owner approval to set `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION=true`.
5. Accept that refunds are operational/manual until dual-leg verify ships.

## Explicitly NOT done this turn

- No Mainnet customer payment
- No invented Stellar keys or memos
- No enabling of live Mainnet collection
