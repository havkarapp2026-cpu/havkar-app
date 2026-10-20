-- Testnet XLM payment records for HAVKAR event tickets.
-- This file is prepared only. Do not apply it to production until the owner approves.
-- It does not alter existing tables, functions, policies, or the Stellar wallet.

CREATE TABLE public.stellar_ticket_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_ticket_id bigint NOT NULL REFERENCES public.event_tickets (id) ON DELETE CASCADE,
  event_id bigint NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  network text NOT NULL DEFAULT 'TESTNET',
  status text NOT NULL DEFAULT 'pending',
  source_public_key text,
  destination_public_key text NOT NULL,
  eur_amount numeric(12,2) NOT NULL,
  eur_per_xlm numeric(18,8) NOT NULL,
  quote_source text NOT NULL,
  quoted_at timestamp with time zone NOT NULL,
  amount_stroops bigint NOT NULL,
  amount_xlm text NOT NULL,
  payment_reference text NOT NULL,
  memo text NOT NULL,
  unsigned_xdr text,
  prepared_hash text,
  tx_hash text,
  sequence text,
  fee text,
  min_time bigint,
  max_time bigint,
  horizon_ledger bigint,
  failure_reason text,
  expires_at timestamp with time zone NOT NULL,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stellar_ticket_payments_network_testnet
    CHECK (network = 'TESTNET'),
  CONSTRAINT stellar_ticket_payments_status_check
    CHECK (status IN ('pending', 'prepared', 'submitted', 'confirmed', 'failed', 'expired')),
  CONSTRAINT stellar_ticket_payments_eur_positive
    CHECK (eur_amount > 0),
  CONSTRAINT stellar_ticket_payments_quote_positive
    CHECK (eur_per_xlm > 0),
  CONSTRAINT stellar_ticket_payments_stroops_positive
    CHECK (amount_stroops > 0),
  CONSTRAINT stellar_ticket_payments_reference_shape
    CHECK (payment_reference ~ '^hk[0-9a-f]{24}$'),
  CONSTRAINT stellar_ticket_payments_memo_matches
    CHECK (memo = payment_reference AND char_length(memo) <= 28),
  CONSTRAINT stellar_ticket_payments_destination_shape
    CHECK (destination_public_key ~ '^G[A-Z2-7]{55}$'),
  CONSTRAINT stellar_ticket_payments_source_shape
    CHECK (source_public_key IS NULL OR source_public_key ~ '^G[A-Z2-7]{55}$'),
  CONSTRAINT stellar_ticket_payments_hash_shape
    CHECK (tx_hash IS NULL OR tx_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT stellar_ticket_payments_prepared_hash_shape
    CHECK (prepared_hash IS NULL OR prepared_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT stellar_ticket_payments_reference_key
    UNIQUE (payment_reference),
  CONSTRAINT stellar_ticket_payments_tx_hash_key
    UNIQUE (tx_hash)
);

CREATE UNIQUE INDEX stellar_ticket_payments_one_open_event
  ON public.stellar_ticket_payments (user_id, event_id)
  WHERE status IN ('pending', 'prepared', 'submitted');

CREATE INDEX stellar_ticket_payments_user_idx
  ON public.stellar_ticket_payments (user_id, created_at DESC);

ALTER TABLE public.stellar_ticket_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own stellar ticket payments"
  ON public.stellar_ticket_payments
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.stellar_ticket_payments
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.stellar_ticket_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stellar_ticket_payments TO service_role;

COMMENT ON TABLE public.stellar_ticket_payments IS
  'Testnet XLM intents for event tickets. Buyers can read their own rows and cannot insert or confirm them.';
