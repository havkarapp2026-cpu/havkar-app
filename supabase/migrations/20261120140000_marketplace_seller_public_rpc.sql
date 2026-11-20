-- Public marketplace seller identity (no private PII).
-- profiles SELECT is owner-only, so clients need a SECURITY DEFINER RPC.
-- Also backfill empty profiles.full_name / avatar_url from auth user metadata.

CREATE OR REPLACE FUNCTION public._havkar_sanitize_public_display_name(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN cleaned IS NULL OR cleaned = '' THEN NULL
    WHEN position('@' in cleaned) > 0 THEN NULL
    WHEN char_length(cleaned) > 80 THEN left(cleaned, 80)
    ELSE cleaned
  END
  FROM (
    SELECT nullif(btrim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g')), '') AS cleaned
  ) s;
$$;

CREATE OR REPLACE FUNCTION public._havkar_public_https_url(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := btrim(coalesce(raw, ''));
BEGIN
  IF v = '' THEN
    RETURN NULL;
  END IF;
  IF lower(v) LIKE 'https://%' AND char_length(v) <= 2048 THEN
    RETURN v;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._havkar_seller_public_from_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_meta jsonb := '{}'::jsonb;
  v_name text;
  v_avatar text;
  v_since timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'display_name', NULL,
      'avatar_url', NULL,
      'country', NULL,
      'city', NULL,
      'member_since', NULL,
      'has_public_profile', false
    );
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  SELECT coalesce(u.raw_user_meta_data, '{}'::jsonb), u.created_at
    INTO v_meta, v_since
  FROM auth.users u
  WHERE u.id = p_user_id;

  v_name := public._havkar_sanitize_public_display_name(v_profile.full_name);
  IF v_name IS NULL THEN
    v_name := public._havkar_sanitize_public_display_name(v_meta->>'full_name');
  END IF;
  IF v_name IS NULL THEN
    v_name := public._havkar_sanitize_public_display_name(v_meta->>'name');
  END IF;
  IF v_name IS NULL THEN
    v_name := public._havkar_sanitize_public_display_name(
      nullif(btrim(concat_ws(' ', v_meta->>'first_name', v_meta->>'last_name')), '')
    );
  END IF;
  IF v_name IS NULL THEN
    v_name := public._havkar_sanitize_public_display_name(v_meta->>'username');
  END IF;

  v_avatar := public._havkar_public_https_url(v_profile.avatar_url);
  IF v_avatar IS NULL THEN
    v_avatar := public._havkar_public_https_url(v_meta->>'avatar_url');
  END IF;
  IF v_avatar IS NULL THEN
    v_avatar := public._havkar_public_https_url(v_meta->>'picture');
  END IF;

  RETURN jsonb_build_object(
    'display_name', v_name,
    'avatar_url', v_avatar,
    'country', nullif(left(btrim(coalesce(v_profile.country, '')), 64), ''),
    'city', nullif(left(btrim(coalesce(v_profile.city, '')), 64), ''),
    'member_since', coalesce(v_profile.created_at, v_since),
    'has_public_profile', (v_name IS NOT NULL OR v_avatar IS NOT NULL)
  );
END;
$$;

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

  -- Public listings: anyone. Draft/paused: owner only (so owner still sees their public identity).
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

REVOKE ALL ON FUNCTION public._havkar_sanitize_public_display_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._havkar_public_https_url(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._havkar_seller_public_from_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketplace_seller_public(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketplace_sellers_public(bigint[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_marketplace_seller_public(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_sellers_public(bigint[]) TO anon, authenticated;

-- Backfill public display fields only (never copy email/phone).
UPDATE public.profiles p
SET
  full_name = coalesce(
    nullif(btrim(p.full_name), ''),
    public._havkar_sanitize_public_display_name(u.raw_user_meta_data->>'full_name'),
    public._havkar_sanitize_public_display_name(u.raw_user_meta_data->>'name'),
    public._havkar_sanitize_public_display_name(u.raw_user_meta_data->>'username')
  ),
  avatar_url = coalesce(
    nullif(btrim(p.avatar_url), ''),
    public._havkar_public_https_url(u.raw_user_meta_data->>'avatar_url'),
    public._havkar_public_https_url(u.raw_user_meta_data->>'picture')
  )
FROM auth.users u
WHERE u.id = p.id
  AND (
    nullif(btrim(coalesce(p.full_name, '')), '') IS NULL
    OR nullif(btrim(coalesce(p.avatar_url, '')), '') IS NULL
  );
