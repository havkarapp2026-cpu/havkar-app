-- Durable Stripe webhook event receipts for idempotent processing.
-- Webhook handler inserts once per evt_*; duplicates return 200 without re-work.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  object_id text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_type_received_idx
  ON public.stripe_webhook_events (event_type, received_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: service_role only (webhook).
REVOKE ALL ON TABLE public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.stripe_webhook_events TO service_role;
