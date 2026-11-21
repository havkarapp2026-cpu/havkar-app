-- One conversation per (listing, buyer, seller). Prevents cross-listing reuse.
-- RPC resolves Message Seller by validated auth.uid() + listing seller_id.

CREATE UNIQUE INDEX IF NOT EXISTS conversations_ad_buyer_seller_uidx
  ON public.conversations (ad_id, buyer_id, seller_id)
  WHERE ad_id IS NOT NULL
    AND buyer_id IS NOT NULL
    AND seller_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.havkar_get_or_create_listing_conversation(
  p_ad_id bigint
)
RETURNS TABLE (
  id uuid,
  ad_id bigint,
  buyer_id uuid,
  seller_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  listing public.ads%ROWTYPE;
  conv public.conversations%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_ad_id IS NULL OR p_ad_id <= 0 THEN
    RAISE EXCEPTION 'Listing id is required';
  END IF;

  SELECT *
    INTO listing
  FROM public.ads a
  WHERE a.id = p_ad_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF listing.user_id IS NULL THEN
    RAISE EXCEPTION 'Seller is not available for this listing';
  END IF;

  IF listing.user_id = uid THEN
    RAISE EXCEPTION 'Cannot message yourself about your own listing';
  END IF;

  LOOP
    SELECT *
      INTO conv
    FROM public.conversations c
    WHERE c.ad_id = listing.id
      AND c.buyer_id = uid
      AND c.seller_id = listing.user_id
    LIMIT 1;

    IF FOUND THEN
      id := conv.id;
      ad_id := conv.ad_id;
      buyer_id := conv.buyer_id;
      seller_id := conv.seller_id;
      created_at := conv.created_at;
      updated_at := conv.updated_at;
      RETURN NEXT;
      RETURN;
    END IF;

    BEGIN
      INSERT INTO public.conversations (ad_id, buyer_id, seller_id)
      VALUES (listing.id, uid, listing.user_id)
      RETURNING
        public.conversations.id,
        public.conversations.ad_id,
        public.conversations.buyer_id,
        public.conversations.seller_id,
        public.conversations.created_at,
        public.conversations.updated_at
      INTO id, ad_id, buyer_id, seller_id, created_at, updated_at;

      RETURN NEXT;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        -- Concurrent insert for the same listing thread; retry select.
        NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.havkar_get_or_create_listing_conversation(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.havkar_get_or_create_listing_conversation(bigint) TO authenticated;

COMMENT ON FUNCTION public.havkar_get_or_create_listing_conversation(bigint) IS
  'Returns the unique listing conversation for auth.uid() as buyer and ads.user_id as seller. Never reuses another listing thread.';
