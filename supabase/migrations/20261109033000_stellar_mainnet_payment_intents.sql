-- Allow Stellar Mainnet settlement rows alongside Testnet.
-- Does not invent destinations or enable payments by itself.
-- Application still requires HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true
-- and HAVKAR_STELLAR_MAINNET_DESTINATION (public key only).

ALTER TABLE public.marketplace_payment_intents
  DROP CONSTRAINT IF EXISTS marketplace_payment_intents_network_check;

ALTER TABLE public.marketplace_payment_intents
  ADD CONSTRAINT marketplace_payment_intents_network_check
  CHECK (network IN ('testnet', 'mainnet'));

COMMENT ON COLUMN public.marketplace_payment_intents.network IS
  'Stellar network for the quote: testnet or mainnet. Mainnet requires env gates.';
