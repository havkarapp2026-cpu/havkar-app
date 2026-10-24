-- Stellar Testnet checkout for existing HAVKAR payment flows.
-- Apply only to havkar-staging (keglioewbkgdabsizvys).
-- Do not apply this file to production project gispovnciifgikvgpzck.

ALTER TABLE public.stellar_ticket_payments
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS service_id text;

UPDATE public.stellar_ticket_payments
SET
  service_type = 'event_ticket',
  service_id = event_id::text
WHERE service_type IS NULL
  AND event_id IS NOT NULL
  AND event_ticket_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stellar_ticket_payments
    WHERE event_id IS NULL
      OR event_ticket_id IS NULL
      OR service_type IS NULL
      OR service_id IS NULL
  ) THEN
    RAISE EXCEPTION 'existing stellar payment is missing its event link';
  END IF;
END $$;

ALTER TABLE public.stellar_ticket_payments
  ALTER COLUMN event_ticket_id DROP NOT NULL,
  ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE public.stellar_ticket_payments
  DROP CONSTRAINT IF EXISTS stellar_ticket_payments_service_check;

ALTER TABLE public.stellar_ticket_payments
  ADD CONSTRAINT stellar_ticket_payments_service_check
  CHECK (
    (
      service_type = 'event_ticket'
      AND event_ticket_id IS NOT NULL
      AND event_id IS NOT NULL
      AND service_id = event_id::text
    )
    OR (
      service_type = 'job_listing'
      AND event_ticket_id IS NULL
      AND event_id IS NULL
      AND service_id ~ '^[1-9][0-9]{0,17}$'
    )
  );

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

  IF v_row.service_type = 'job_listing' THEN
    UPDATE public.jobs
    SET status = 'active'
    WHERE id = v_row.service_id::bigint
      AND user_id = v_row.user_id
      AND status = 'pending_payment'
      AND monthly_fee = v_row.eur_amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'job not pending' USING ERRCODE = 'P0001';
    END IF;
  ELSE
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
    pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'ledger', p_ledger, 'service_type', v_row.service_type)
  );

  RETURN v_row;
END;
$$;

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
  v_payment public.stellar_ticket_payments;
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
    AND status = ANY (ARRAY['CONFIRMED', 'REFUND_PENDING', 'confirmed'])
  RETURNING * INTO v_payment;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'payment not refundable' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.service_type = 'job_listing' THEN
    UPDATE public.jobs
    SET status = 'pending_payment'
    WHERE id = v_payment.service_id::bigint
      AND user_id = v_refund.user_id
      AND status = 'active'
      AND monthly_fee = v_payment.eur_amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'job not active' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    UPDATE public.event_tickets
    SET
      payment_status = 'refunded',
      ticket_status = 'cancelled'
    WHERE id = v_payment.event_ticket_id
      AND user_id = v_refund.user_id
      AND payment_status = 'paid';
  END IF;

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
    pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'ledger', p_ledger, 'service_type', v_payment.service_type)
  );

  RETURN v_refund;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stellar_ticket_payment(uuid, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_stellar_refund(uuid, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_stellar_ticket_payment(uuid, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_stellar_refund(uuid, text, bigint) TO service_role;
