-- Allow HAVKAR-owned prepaid XLM products (jobs_listing, business_listing,
-- ai_credits) to record settlement_model = platform_prepaid.
-- This is distinct from legacy marketplace platform_collect.

ALTER TABLE public.marketplace_payment_intents
  DROP CONSTRAINT IF EXISTS marketplace_payment_intents_settlement_model_chk;

ALTER TABLE public.marketplace_payment_intents
  ADD CONSTRAINT marketplace_payment_intents_settlement_model_chk
  CHECK (
    settlement_model IS NULL
    OR settlement_model IN ('direct_split', 'platform_collect', 'platform_prepaid')
  );

COMMENT ON COLUMN public.marketplace_payment_intents.settlement_model IS
  'direct_split = buyer pays merchant + platform fee; platform_prepaid = HAVKAR-owned product price to network destination; platform_collect = legacy third-party single HAVKAR destination.';
