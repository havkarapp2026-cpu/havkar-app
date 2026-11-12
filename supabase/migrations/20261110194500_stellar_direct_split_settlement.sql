-- Direct-split XLM settlement support (merchant receive + platform fee).
-- Does not enable LIVE_COLLECTION or Production geo enforcement.
-- Apply on Production only with Owner approval.

CREATE TABLE IF NOT EXISTS public.stellar_receive_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  public_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stellar_receive_accounts_pubkey_chk
    CHECK (public_key ~ '^G[A-Z2-7]{55}$')
);

CREATE INDEX IF NOT EXISTS stellar_receive_accounts_public_key_idx
  ON public.stellar_receive_accounts (public_key);

ALTER TABLE public.stellar_receive_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stellar_receive_accounts_select_own ON public.stellar_receive_accounts;
CREATE POLICY stellar_receive_accounts_select_own
  ON public.stellar_receive_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS stellar_receive_accounts_upsert_own ON public.stellar_receive_accounts;
CREATE POLICY stellar_receive_accounts_insert_own
  ON public.stellar_receive_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS stellar_receive_accounts_update_own ON public.stellar_receive_accounts;
CREATE POLICY stellar_receive_accounts_update_own
  ON public.stellar_receive_accounts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS stellar_receive_accounts_delete_own ON public.stellar_receive_accounts;
CREATE POLICY stellar_receive_accounts_delete_own
  ON public.stellar_receive_accounts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.stellar_receive_accounts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stellar_receive_accounts TO authenticated;
GRANT ALL ON TABLE public.stellar_receive_accounts TO service_role;

COMMENT ON TABLE public.stellar_receive_accounts IS
  'Merchant/provider Stellar receive public keys for direct-split XLM settlement. Public keys only; never store seeds.';

ALTER TABLE public.marketplace_payment_intents
  ADD COLUMN IF NOT EXISTS settlement_model text,
  ADD COLUMN IF NOT EXISTS merchant_destination text,
  ADD COLUMN IF NOT EXISTS platform_destination text,
  ADD COLUMN IF NOT EXISTS merchant_amount_xlm numeric,
  ADD COLUMN IF NOT EXISTS platform_fee_xlm numeric;

ALTER TABLE public.marketplace_payment_intents
  DROP CONSTRAINT IF EXISTS marketplace_payment_intents_settlement_model_chk;

ALTER TABLE public.marketplace_payment_intents
  ADD CONSTRAINT marketplace_payment_intents_settlement_model_chk
  CHECK (
    settlement_model IS NULL
    OR settlement_model IN ('direct_split', 'platform_collect')
  );

COMMENT ON COLUMN public.marketplace_payment_intents.settlement_model IS
  'direct_split = buyer pays merchant + platform fee in one user-signed tx; platform_collect = legacy single HAVKAR destination.';
