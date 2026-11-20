-- Do not invent a fake seller display name. Expose missing_reason instead.

CREATE OR REPLACE FUNCTION public.get_marketplace_seller_public(p_ad_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ad public.ads%ROWTYPE;
  v_status text;
  v_seller jsonb;
BEGIN
  IF p_ad_id IS NULL OR p_ad_id <= 0 THEN
    RAISE EXCEPTION 'invalid_ad_id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ad
  FROM public.ads
  WHERE id = p_ad_id;

  IF NOT FOUND OR v_ad.user_id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(v_ad.listing_surface, 'marketplace') <> 'marketplace' THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  v_status := lower(btrim(coalesce(v_ad.status, 'active')));
  IF v_status = '' THEN
    v_status := 'active';
  END IF;

  IF v_status NOT IN ('active', 'published', 'reserved') THEN
    IF auth.uid() IS NULL OR auth.uid() <> v_ad.user_id THEN
      RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v_seller := public._havkar_seller_public_from_user(v_ad.user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'listing_id', v_ad.id::text,
    'seller_user_id', v_ad.user_id::text,
    'seller', v_seller,
    'fallback_label', NULL,
    'missing_reason', CASE
      WHEN coalesce((v_seller->>'has_public_profile')::boolean, false)
        THEN NULL
      ELSE 'This seller has not set a public display name or avatar.'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_marketplace_sellers_public(p_ad_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_id bigint;
  v_ad public.ads%ROWTYPE;
  v_status text;
  v_seller jsonb;
BEGIN
  IF p_ad_ids IS NULL OR cardinality(p_ad_ids) = 0 THEN
    RETURN v_out;
  END IF;

  FOREACH v_id IN ARRAY p_ad_ids LOOP
    IF v_id IS NULL OR v_id <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_ad
    FROM public.ads
    WHERE id = v_id;

    IF NOT FOUND OR v_ad.user_id IS NULL THEN
      CONTINUE;
    END IF;

    IF coalesce(v_ad.listing_surface, 'marketplace') <> 'marketplace' THEN
      CONTINUE;
    END IF;

    v_status := lower(btrim(coalesce(v_ad.status, 'active')));
    IF v_status = '' THEN
      v_status := 'active';
    END IF;

    IF v_status NOT IN ('active', 'published', 'reserved') THEN
      IF auth.uid() IS NULL OR auth.uid() <> v_ad.user_id THEN
        CONTINUE;
      END IF;
    END IF;

    v_seller := public._havkar_seller_public_from_user(v_ad.user_id);
    v_out := v_out || jsonb_build_object(
      v_ad.id::text,
      jsonb_build_object(
        'ok', true,
        'listing_id', v_ad.id::text,
        'seller_user_id', v_ad.user_id::text,
        'seller', v_seller,
        'fallback_label', NULL,
        'missing_reason', CASE
          WHEN coalesce((v_seller->>'has_public_profile')::boolean, false)
            THEN NULL
          ELSE 'This seller has not set a public display name or avatar.'
        END
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_seller_public(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketplace_sellers_public(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_seller_public(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_sellers_public(bigint[]) TO anon, authenticated;
