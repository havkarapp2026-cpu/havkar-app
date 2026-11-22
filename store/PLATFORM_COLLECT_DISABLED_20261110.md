# platform_collect disabled for customer-facing XLM (10 November 2026)

## Change

- Default: `HAVKAR_XLM_ALLOW_PLATFORM_COLLECT` must be exact `"true"` to run legacy `platform_collect`.
- Without that flag, customer quotes without a merchant receive key return `MERCHANT_RECEIVE_KEY_REQUIRED`.
- Failed / unavailable `direct_split` returns `PLATFORM_COLLECT_DISABLED` instead of falling back.
- Settlement verification of `platform_collect` intents is refused with `PLATFORM_COLLECT_DISABLED` unless opted in.
- Legacy code path remains in `lib/stellar-checkout.cjs` / `lib/stellar-settlement-models.cjs` for legal review.

## Preserved

- `direct_split` architecture and fee rules (2% / 3% / 10%)
- External Stellar wallet connectors
- `docs/scf/**` unchanged by this change set’s functional intent
- Mainnet LIVE_COLLECTION still exact-true gated (OFF by default)

## Tests

`tests/platform-collect-disabled.test.mjs` plus updated settlement/mainnet/xlm guards.
