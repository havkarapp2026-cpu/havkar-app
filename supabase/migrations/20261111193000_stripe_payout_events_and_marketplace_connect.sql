-- Stripe payout lifecycle ledger + marketplace Connect seller linkage.
-- Does not enable live payments. Service role writes webhooks; sellers read own row.

CREATE TABLE IF NOT EXISTS public.stripe_payout_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payout_id text,
  livemode boolean NOT NULL DEFAULT false,
  status text,
  amount bigint,
  currency text,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_payout_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stripe payout events owner read" ON public.stripe_payout_events;
CREATE POLICY "stripe payout events owner read"
  ON public.stripe_payout_events
  FOR SELECT
  TO authenticated
  USING (
    havkar_private.caller_is_owner()
    OR havkar_private.caller_is_admin()
  );

CREATE TABLE IF NOT EXISTS public.marketplace_seller_connect_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  onboarding_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_seller_connect_onboarding_status_check
    CHECK (onboarding_status = ANY (ARRAY[
      'pending'::text,
      'restricted'::text,
      'complete'::text,
      'disabled'::text
    ]))
);

CREATE INDEX IF NOT EXISTS marketplace_seller_connect_accounts_stripe_uidx
  ON public.marketplace_seller_connect_accounts (stripe_account_id);

ALTER TABLE public.marketplace_seller_connect_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sellers read own connect account" ON public.marketplace_seller_connect_accounts;
CREATE POLICY "sellers read own connect account"
  ON public.marketplace_seller_connect_accounts
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR havkar_private.caller_is_owner()
    OR havkar_private.caller_is_admin()
  );

COMMENT ON TABLE public.stripe_payout_events IS
  'Idempotent Stripe payout.* webhook ledger. Not a bank statement.';
COMMENT ON TABLE public.marketplace_seller_connect_accounts IS
  'Buy & Sell Stripe Connect recipient accounts. Live collection remains Owner-gated.';
