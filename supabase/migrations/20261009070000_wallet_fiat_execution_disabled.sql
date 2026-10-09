-- Wallet fiat execution stays disabled.
-- This file does not credit, debit, or exchange any existing balance.
-- Apply it separately. It is not applied by the application deploy.
--
-- Euro and dollar movement needs a licensed partner and safeguarded funds.
-- The functions below only validate and record that no money moved.

CREATE OR REPLACE FUNCTION public.transfer_money(
  p_receiver_id uuid,
  p_amount numeric,
  p_note text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'FIAT_TRANSFERS_DISABLED'
    USING ERRCODE = 'P0001',
          HINT = 'Euro transfers stay disabled until a licensed partner and safeguarded funds exist.';
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_money(uuid, numeric, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transfer_money(uuid, numeric, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.havkar_iban_is_valid(p_iban text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_iban text;
  v_rearranged text;
  v_expanded text := '';
  v_char text;
  i integer;
  v_remainder integer := 0;
BEGIN
  v_iban := upper(regexp_replace(coalesce(p_iban, ''), '\s+', '', 'g'));

  IF v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'
     OR char_length(v_iban) < 15
     OR char_length(v_iban) > 34 THEN
    RETURN false;
  END IF;

  v_rearranged := substr(v_iban, 5) || substr(v_iban, 1, 4);

  FOR i IN 1..char_length(v_rearranged) LOOP
    v_char := substr(v_rearranged, i, 1);

    IF v_char ~ '[A-Z]' THEN
      v_expanded := v_expanded || (ascii(v_char) - 55)::text;
    ELSE
      v_expanded := v_expanded || v_char;
    END IF;
  END LOOP;

  FOR i IN 1..char_length(v_expanded) LOOP
    v_remainder := (v_remainder * 10 + substr(v_expanded, i, 1)::integer) % 97;
  END LOOP;

  RETURN v_remainder = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.havkar_iban_is_valid(text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.havkar_iban_is_valid(text)
  TO authenticated, service_role;

CREATE TABLE public.wallet_operation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  status text NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency text NOT NULL,
  counterparty_user_id uuid,
  reference text NOT NULL,
  idempotency_key text NOT NULL,
  reason text NOT NULL,
  iban_masked text,
  fee_amount numeric(18,2) NOT NULL DEFAULT 0,
  details text,
  CONSTRAINT wallet_operation_requests_operation_check
    CHECK (operation IN ('internal_transfer', 'withdrawal')),
  CONSTRAINT wallet_operation_requests_status_check
    CHECK (status IN ('rejected', 'not_submitted')),
  CONSTRAINT wallet_operation_requests_amount_check
    CHECK (amount > 0),
  CONSTRAINT wallet_operation_requests_currency_check
    CHECK (currency IN ('EUR', 'USD')),
  CONSTRAINT wallet_operation_requests_fee_check
    CHECK (fee_amount = 0),
  CONSTRAINT wallet_operation_requests_reference_key
    UNIQUE (reference),
  CONSTRAINT wallet_operation_requests_idempotency_key
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX wallet_operation_requests_user_idx
  ON public.wallet_operation_requests (user_id, created_at DESC);

ALTER TABLE public.wallet_operation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet operation requests"
  ON public.wallet_operation_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.wallet_operation_requests
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.wallet_operation_requests
  TO authenticated;

CREATE OR REPLACE FUNCTION public.request_internal_transfer(
  p_receiver_id uuid,
  p_amount numeric,
  p_idempotency_key uuid
)
RETURNS public.wallet_operation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender uuid;
  v_existing public.wallet_operation_requests%ROWTYPE;
  v_id uuid;
  v_reference text;
BEGIN
  v_sender := auth.uid();

  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED'
      USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'
      USING ERRCODE = '22023';
  END IF;

  IF p_receiver_id IS NULL OR p_receiver_id = v_sender THEN
    RAISE EXCEPTION 'INVALID_RECEIVER'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount <> trunc(p_amount, 2)
     OR p_amount > 9999999999999999.99 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = p_receiver_id
  ) THEN
    RAISE EXCEPTION 'RECEIVER_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wallets
    WHERE user_id = p_receiver_id
      AND currency = 'EUR'
  ) THEN
    RAISE EXCEPTION 'RECEIVER_WALLET_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_existing
  FROM public.wallet_operation_requests
  WHERE user_id = v_sender
    AND idempotency_key = p_idempotency_key::text
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_id := gen_random_uuid();
  v_reference := 'HVW-' || upper(substr(replace(v_id::text, '-', ''), 1, 16));

  INSERT INTO public.wallet_operation_requests (
    id,
    user_id,
    operation,
    status,
    amount,
    currency,
    counterparty_user_id,
    reference,
    idempotency_key,
    reason,
    fee_amount,
    details
  ) VALUES (
    v_id,
    v_sender,
    'internal_transfer',
    'rejected',
    p_amount,
    'EUR',
    p_receiver_id,
    v_reference,
    p_idempotency_key::text,
    'fiat_execution_disabled',
    0,
    'No euro balance was moved.'
  )
  RETURNING * INTO v_existing;

  RETURN v_existing;
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
      INTO v_existing
    FROM public.wallet_operation_requests
    WHERE user_id = v_sender
      AND idempotency_key = p_idempotency_key::text;

    RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.request_internal_transfer(uuid, numeric, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_internal_transfer(uuid, numeric, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_currency text,
  p_iban text,
  p_idempotency_key uuid
)
RETURNS public.wallet_operation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid;
  v_existing public.wallet_operation_requests%ROWTYPE;
  v_id uuid;
  v_reference text;
  v_masked text;
  v_compact text;
BEGIN
  v_user := auth.uid();

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED'
      USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'
      USING ERRCODE = '22023';
  END IF;

  IF p_currency IS DISTINCT FROM 'EUR' AND p_currency IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION 'UNSUPPORTED_CURRENCY'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount <> trunc(p_amount, 2)
     OR p_amount > 9999999999999999.99 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT'
      USING ERRCODE = '22023';
  END IF;

  IF public.havkar_iban_is_valid(p_iban) IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_IBAN'
      USING ERRCODE = '22023';
  END IF;

  v_compact := upper(regexp_replace(p_iban, '\s+', '', 'g'));
  v_masked := substr(v_compact, 1, 2) || '…' || right(v_compact, 4);

  SELECT *
    INTO v_existing
  FROM public.wallet_operation_requests
  WHERE user_id = v_user
    AND idempotency_key = p_idempotency_key::text
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_id := gen_random_uuid();
  v_reference := 'HVW-' || upper(substr(replace(v_id::text, '-', ''), 1, 16));

  INSERT INTO public.wallet_operation_requests (
    id,
    user_id,
    operation,
    status,
    amount,
    currency,
    reference,
    idempotency_key,
    reason,
    iban_masked,
    fee_amount,
    details
  ) VALUES (
    v_id,
    v_user,
    'withdrawal',
    'not_submitted',
    p_amount,
    p_currency,
    v_reference,
    p_idempotency_key::text,
    'licensed_payout_provider_required',
    v_masked,
    0,
    'The bank account was checked. No payout was created and no balance was reduced.'
  )
  RETURNING * INTO v_existing;

  RETURN v_existing;
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
      INTO v_existing
    FROM public.wallet_operation_requests
    WHERE user_id = v_user
      AND idempotency_key = p_idempotency_key::text;

    RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, uuid)
  TO authenticated;

DROP POLICY IF EXISTS "Users can create their own exchanges"
  ON public.wallet_exchanges;

DROP POLICY IF EXISTS "Users can update their own exchanges"
  ON public.wallet_exchanges;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.wallets
  FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.wallet_transactions
  FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.wallet_transfers
  FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.wallet_exchanges
  FROM anon, authenticated;
