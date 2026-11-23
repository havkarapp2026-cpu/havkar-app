-- Card marketplace orders for ads-based Buy & Sell.
-- Legacy public.marketplace_orders.listing_id is UUID → marketplace_listings,
-- so live ads (bigint) cannot be stored there. This table is additive only.

CREATE TABLE IF NOT EXISTS public.marketplace_card_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id bigint NOT NULL REFERENCES public.ads(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  listing_title text,
  list_price_eur numeric(12, 2),
  buyer_pays numeric(12, 2) NOT NULL,
  seller_receives numeric(12, 2),
  platform_fee numeric(12, 2),
  currency text NOT NULL DEFAULT 'eur',
  status text NOT NULL DEFAULT 'paid',
  stripe_session_id text,
  stripe_payment_intent text,
  stripe_charge_id text,
  stripe_transfer_id text,
  stripe_application_fee_id text,
  stripe_connected_account_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_card_orders_status_chk
    CHECK (status = ANY (ARRAY['paid'::text, 'refunded'::text, 'disputed'::text])),
  CONSTRAINT marketplace_card_orders_currency_chk
    CHECK (char_length(btrim(currency)) BETWEEN 3 AND 8)
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_card_orders_session_uidx
  ON public.marketplace_card_orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_card_orders_pi_uidx
  ON public.marketplace_card_orders (stripe_payment_intent)
  WHERE stripe_payment_intent IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketplace_card_orders_buyer_idx
  ON public.marketplace_card_orders (buyer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_card_orders_seller_idx
  ON public.marketplace_card_orders (seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_card_orders_ad_idx
  ON public.marketplace_card_orders (ad_id);

COMMENT ON TABLE public.marketplace_card_orders IS
  'Live Stripe Connect destination-charge marketplace orders for public.ads. Does not replace legacy marketplace_orders.';

ALTER TABLE public.marketplace_card_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.marketplace_card_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_card_orders TO authenticated;
GRANT ALL ON TABLE public.marketplace_card_orders TO service_role;

DROP POLICY IF EXISTS marketplace_card_orders_select_buyer ON public.marketplace_card_orders;
CREATE POLICY marketplace_card_orders_select_buyer
ON public.marketplace_card_orders
FOR SELECT
TO authenticated
USING (buyer_id = auth.uid());

DROP POLICY IF EXISTS marketplace_card_orders_select_seller ON public.marketplace_card_orders;
CREATE POLICY marketplace_card_orders_select_seller
ON public.marketplace_card_orders
FOR SELECT
TO authenticated
USING (seller_id = auth.uid());

-- Owner/admin read-all via RPC (service role used by API for owner scope).
CREATE OR REPLACE FUNCTION public.list_marketplace_card_orders_for_caller(
  p_role text DEFAULT 'auto',
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.marketplace_card_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  role text := lower(btrim(coalesce(p_role, 'auto')));
  lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
  is_owner boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  BEGIN
    is_owner := coalesce(havkar_private.caller_is_admin(), false);
  EXCEPTION
    WHEN undefined_function THEN
      is_owner := false;
  END;
  IF uid = '9b34b0bb-271a-49ee-aeb7-a9d28be06a06'::uuid THEN
    is_owner := true;
  END IF;

  IF role = 'owner' AND NOT is_owner THEN
    RAISE EXCEPTION 'owner role denied' USING ERRCODE = '42501';
  END IF;

  IF role = 'owner' OR (role = 'auto' AND is_owner) THEN
    RETURN QUERY
      SELECT *
      FROM public.marketplace_card_orders o
      ORDER BY o.created_at DESC
      LIMIT lim;
  ELSIF role = 'seller' THEN
    RETURN QUERY
      SELECT *
      FROM public.marketplace_card_orders o
      WHERE o.seller_id = uid
      ORDER BY o.created_at DESC
      LIMIT lim;
  ELSIF role = 'buyer' THEN
    RETURN QUERY
      SELECT *
      FROM public.marketplace_card_orders o
      WHERE o.buyer_id = uid
      ORDER BY o.created_at DESC
      LIMIT lim;
  ELSE
    /* auto for non-owner: buyer + seller rows for this user */
    RETURN QUERY
      SELECT *
      FROM public.marketplace_card_orders o
      WHERE o.buyer_id = uid OR o.seller_id = uid
      ORDER BY o.created_at DESC
      LIMIT lim;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_marketplace_card_orders_for_caller(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_marketplace_card_orders_for_caller(text, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_marketplace_card_orders_for_caller(text, integer)
  TO service_role;
