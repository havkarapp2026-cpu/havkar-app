-- HAVKAR Travel Plus subscriptions (Stripe Billing entitlement).
-- Free GPS / My trips / memories / reminders are NOT gated by this table.
-- Owner-only RLS. Staff have no default read of billing rows.

CREATE TABLE IF NOT EXISTS public.travel_plus_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status text NOT NULL DEFAULT 'incomplete',
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  livemode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT travel_plus_status_check CHECK (
    status = ANY (ARRAY[
      'incomplete'::text,
      'incomplete_expired'::text,
      'trialing'::text,
      'trialing_or_active'::text,
      'active'::text,
      'past_due'::text,
      'canceled'::text,
      'unpaid'::text,
      'paused'::text
    ])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS travel_plus_subscriptions_stripe_sub_uidx
  ON public.travel_plus_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS travel_plus_subscriptions_customer_idx
  ON public.travel_plus_subscriptions (stripe_customer_id);

ALTER TABLE public.travel_plus_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "travel plus owner select" ON public.travel_plus_subscriptions;
CREATE POLICY "travel plus owner select"
  ON public.travel_plus_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Writes are service-role / webhook only (no authenticated INSERT/UPDATE policy).
REVOKE ALL ON TABLE public.travel_plus_subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.travel_plus_subscriptions FROM authenticated;
GRANT SELECT ON TABLE public.travel_plus_subscriptions TO authenticated;

COMMENT ON TABLE public.travel_plus_subscriptions IS
  'Travel Plus Stripe entitlement. Free travel features stay available without a row here.';
