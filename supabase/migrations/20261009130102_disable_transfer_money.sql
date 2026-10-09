-- Disable euro transfers in public.transfer_money.
-- This replaces only that function body.
-- It does not update, insert, or delete wallet balances or history.
-- It does not change tables, policies, triggers, or grants on wallet tables.
-- Apply only after explicit approval. Deploying the file does not run it.

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
