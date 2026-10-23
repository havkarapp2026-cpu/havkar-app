-- Stellar Testnet payment controls for havkar-staging (keglioewbkgdabsizvys).
-- Do not apply this file to production project gispovnciifgikvgpzck.
-- Existing lowercase statuses stay valid. New payments use the uppercase states.
-- Buyers can read their own rows. They cannot insert, update, confirm, or refund.

CREATE SCHEMA IF NOT EXISTS havkar_private;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.stellar_ticket_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  event_ticket_id bigint NOT NULL REFERENCES public.event_tickets (id) ON DELETE RESTRICT,
  event_id bigint NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  network text NOT NULL DEFAULT 'TESTNET',
  status text NOT NULL DEFAULT 'PENDING',
  source_public_key text,
  destination_public_key text NOT NULL,
  eur_amount numeric NOT NULL,
  eur_per_xlm numeric NOT NULL,
  quote_source text NOT NULL,
  quoted_at timestamptz NOT NULL,
  amount_stroops bigint NOT NULL,
  amount_xlm text NOT NULL,
  payment_reference text NOT NULL UNIQUE,
  memo text NOT NULL,
  unsigned_xdr text,
  prepared_hash text,
  tx_hash text UNIQUE,
  sequence text,
  fee text,
  min_time bigint,
  max_time bigint,
  horizon_ledger bigint,
  failure_reason text,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reconciliation_state text,
  CONSTRAINT stellar_ticket_payments_network_testnet CHECK (network = 'TESTNET'),
  CONSTRAINT stellar_ticket_payments_eur_positive CHECK (eur_amount > 0),
  CONSTRAINT stellar_ticket_payments_quote_positive CHECK (eur_per_xlm > 0),
  CONSTRAINT stellar_ticket_payments_stroops_positive CHECK (amount_stroops > 0),
  CONSTRAINT stellar_ticket_payments_destination_shape CHECK (destination_public_key ~ '^G[A-Z2-7]{55}$'),
  CONSTRAINT stellar_ticket_payments_source_shape CHECK (source_public_key IS NULL OR source_public_key ~ '^G[A-Z2-7]{55}$'),
  CONSTRAINT stellar_ticket_payments_reference_shape CHECK (payment_reference ~ '^hk[0-9a-f]{24}$'),
  CONSTRAINT stellar_ticket_payments_memo_matches CHECK (memo = payment_reference AND char_length(memo) <= 28),
  CONSTRAINT stellar_ticket_payments_hash_shape CHECK (tx_hash IS NULL OR tx_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT stellar_ticket_payments_prepared_hash_shape CHECK (prepared_hash IS NULL OR prepared_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE public.stellar_ticket_payments
  ADD COLUMN IF NOT EXISTS reconciliation_state text;

ALTER TABLE public.stellar_ticket_payments
  DROP CONSTRAINT IF EXISTS stellar_ticket_payments_status_check;

ALTER TABLE public.stellar_ticket_payments
  ADD CONSTRAINT stellar_ticket_payments_status_check
  CHECK (
    status = ANY (ARRAY[
      'pending',
      'prepared',
      'submitted',
      'confirmed',
      'failed',
      'expired',
      'PENDING',
      'AWAITING_SIGNATURE',
      'SUBMITTED',
      'CONFIRMED',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
      'REFUND_PENDING',
      'REFUNDED'
    ])
  );

ALTER TABLE public.stellar_ticket_payments
  DROP CONSTRAINT IF EXISTS stellar_ticket_payments_reconciliation_check;

ALTER TABLE public.stellar_ticket_payments
  ADD CONSTRAINT stellar_ticket_payments_reconciliation_check
  CHECK (
    reconciliation_state IS NULL
    OR reconciliation_state = ANY (ARRAY['matched', 'mismatch'])
  );

ALTER TABLE public.stellar_ticket_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own stellar ticket payments"
  ON public.stellar_ticket_payments;

CREATE POLICY "Users can read their own stellar ticket payments"
  ON public.stellar_ticket_payments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid() AS uid) = user_id));

REVOKE ALL ON TABLE public.stellar_ticket_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.stellar_ticket_payments TO authenticated;

CREATE TABLE IF NOT EXISTS public.stellar_payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.stellar_ticket_payments (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  network text NOT NULL DEFAULT 'TESTNET',
  status text NOT NULL,
  amount_stroops bigint NOT NULL,
  amount_xlm text NOT NULL,
  source_public_key text NOT NULL,
  destination_public_key text NOT NULL,
  memo text NOT NULL,
  tx_hash text,
  horizon_ledger bigint,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  CONSTRAINT stellar_payment_refunds_network_testnet CHECK (network = 'TESTNET'),
  CONSTRAINT stellar_payment_refunds_status_check CHECK (
    status = ANY (ARRAY['REFUND_PENDING', 'REFUNDED', 'FAILED', 'CANCELLED'])
  ),
  CONSTRAINT stellar_payment_refunds_amount_positive CHECK (amount_stroops > 0),
  CONSTRAINT stellar_payment_refunds_source_shape CHECK (source_public_key ~ '^G[A-Z2-7]{55}$'),
  CONSTRAINT stellar_payment_refunds_destination_shape CHECK (destination_public_key ~ '^G[A-Z2-7]{55}$'),
  CONSTRAINT stellar_payment_refunds_memo_length CHECK (char_length(memo) <= 28),
  CONSTRAINT stellar_payment_refunds_hash_shape CHECK (tx_hash IS NULL OR tx_hash ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS stellar_payment_refunds_tx_hash_key
  ON public.stellar_payment_refunds (tx_hash);

ALTER TABLE public.stellar_payment_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own stellar refunds"
  ON public.stellar_payment_refunds;

CREATE POLICY "Users can read their own stellar refunds"
  ON public.stellar_payment_refunds
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid() AS uid) = user_id));

REVOKE ALL ON TABLE public.stellar_payment_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.stellar_payment_refunds TO authenticated;

CREATE TABLE IF NOT EXISTS havkar_private.stellar_payment_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id uuid,
  refund_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stellar_payment_audit_action_length CHECK (char_length(action) BETWEEN 1 AND 80)
);

ALTER TABLE havkar_private.stellar_payment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE havkar_private.stellar_payment_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_stellar_ticket_payment(
  p_payment_id uuid,
  p_tx_hash text,
  p_ledger bigint,
  p_source text
)
RETURNS public.stellar_ticket_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.stellar_ticket_payments;
BEGIN
  IF p_tx_hash IS NULL OR p_tx_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid stellar transaction hash' USING ERRCODE = '22023';
  END IF;

  IF p_source IS NULL OR p_source !~ '^G[A-Z2-7]{55}$' THEN
    RAISE EXCEPTION 'invalid stellar source' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stellar_ticket_payments
  SET
    status = 'CONFIRMED',
    tx_hash = p_tx_hash,
    horizon_ledger = p_ledger,
    source_public_key = p_source,
    confirmed_at = pg_catalog.now(),
    reconciliation_state = 'matched',
    updated_at = pg_catalog.now(),
    failure_reason = NULL
  WHERE id = p_payment_id
    AND tx_hash IS NULL
    AND status = ANY (ARRAY['AWAITING_SIGNATURE', 'SUBMITTED', 'prepared', 'submitted'])
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'payment not confirmable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.event_tickets
  SET
    payment_status = 'paid',
    ticket_status = 'valid',
    payment_provider = 'stellar_testnet',
    payment_reference = p_tx_hash,
    paid_at = pg_catalog.now()
  WHERE id = v_row.event_ticket_id
    AND user_id = v_row.user_id
    AND payment_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket not pending' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO havkar_private.stellar_payment_audit (
    payment_id,
    actor_user_id,
    action,
    detail
  ) VALUES (
    p_payment_id,
    v_row.user_id,
    'confirmed',
    pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'ledger', p_ledger)
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stellar_ticket_payment(uuid, text, bigint, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_stellar_refund(
  p_refund_id uuid,
  p_tx_hash text,
  p_ledger bigint
)
RETURNS public.stellar_payment_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refund public.stellar_payment_refunds;
BEGIN
  IF p_tx_hash IS NULL OR p_tx_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid stellar transaction hash' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stellar_payment_refunds
  SET
    status = 'REFUNDED',
    tx_hash = p_tx_hash,
    horizon_ledger = p_ledger,
    confirmed_at = pg_catalog.now(),
    failure_reason = NULL
  WHERE id = p_refund_id
    AND status = 'REFUND_PENDING'
    AND tx_hash IS NULL
  RETURNING * INTO v_refund;

  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'refund not confirmable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.stellar_ticket_payments
  SET
    status = 'REFUNDED',
    updated_at = pg_catalog.now(),
    reconciliation_state = 'matched'
  WHERE id = v_refund.payment_id
    AND status = ANY (ARRAY['CONFIRMED', 'REFUND_PENDING', 'confirmed']);

  UPDATE public.event_tickets
  SET
    payment_status = 'refunded',
    ticket_status = 'cancelled'
  WHERE id = (
    SELECT event_ticket_id
    FROM public.stellar_ticket_payments
    WHERE id = v_refund.payment_id
  )
    AND user_id = v_refund.user_id
    AND payment_status = 'paid';

  INSERT INTO havkar_private.stellar_payment_audit (
    payment_id,
    refund_id,
    actor_user_id,
    action,
    detail
  ) VALUES (
    v_refund.payment_id,
    v_refund.id,
    v_refund.user_id,
    'refunded',
    pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'ledger', p_ledger)
  );

  RETURN v_refund;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stellar_refund(uuid, text, bigint)
  FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA havkar_private TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_stellar_ticket_payment(uuid, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_stellar_refund(uuid, text, bigint) TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stellar_ticket_payments TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stellar_payment_refunds TO service_role;
GRANT SELECT, INSERT ON TABLE havkar_private.stellar_payment_audit TO service_role;
