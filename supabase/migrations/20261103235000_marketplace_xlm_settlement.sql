-- Settlement states for Testnet XLM quotes.
-- Authenticated users can read their rows and cannot mark them settled.
-- Mainnet is not enabled. No destination account is stored by this file.

ALTER TABLE public.marketplace_payment_intents
  ADD COLUMN IF NOT EXISTS amount_xlm numeric,
  ADD COLUMN IF NOT EXISTS eur_per_xlm numeric,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS memo text,
  ADD COLUMN IF NOT EXISTS subject_id text,
  ADD COLUMN IF NOT EXISTS tx_hash text,
  ADD COLUMN IF NOT EXISTS payer_account text,
  ADD COLUMN IF NOT EXISTS refund_tx_hash text,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE public.marketplace_payment_intents
  DROP CONSTRAINT IF EXISTS marketplace_payment_intents_status_check;

ALTER TABLE public.marketplace_payment_intents
  ADD CONSTRAINT marketplace_payment_intents_status_check
  CHECK (status IN ('unpaid', 'settled', 'refunded', 'rejected', 'expired'));

ALTER TABLE public.marketplace_payment_intents
  DROP CONSTRAINT IF EXISTS marketplace_payment_intents_amount_xlm_check;

ALTER TABLE public.marketplace_payment_intents
  ADD CONSTRAINT marketplace_payment_intents_amount_xlm_check
  CHECK (amount_xlm IS NULL OR amount_xlm > 0);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_payment_intents_tx_hash_uidx
  ON public.marketplace_payment_intents (tx_hash)
  WHERE tx_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_payment_intents_refund_tx_uidx
  ON public.marketplace_payment_intents (refund_tx_hash)
  WHERE refund_tx_hash IS NOT NULL;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.marketplace_payment_intents
  FROM PUBLIC, anon, authenticated;
