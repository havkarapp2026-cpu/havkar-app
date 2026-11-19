-- Marketplace listing reports (Buy & Sell). Keeps advertising create_ad_report() unchanged.
-- Dependencies: public.ads, public.ad_reports (from 20261108010000_ads_production_lifecycle.sql).
-- Do NOT apply to Production without Owner approval.
CREATE OR REPLACE FUNCTION public.create_marketplace_listing_report(
  p_ad_id bigint,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  owner_id uuid;
  new_id bigint;
  reason_text text := btrim(COALESCE(p_reason, ''));
  details_text text := NULLIF(btrim(COALESCE(p_details, '')), '');
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF reason_text = '' OR char_length(reason_text) > 120 THEN
    RAISE EXCEPTION 'invalid report reason' USING ERRCODE = '22023';
  END IF;

  IF details_text IS NOT NULL AND char_length(details_text) > 2000 THEN
    RAISE EXCEPTION 'report details too long' USING ERRCODE = '22023';
  END IF;

  SELECT a.user_id
  INTO owner_id
  FROM public.ads AS a
  WHERE a.id = p_ad_id
    AND a.listing_surface = 'marketplace'
    AND a.status IN ('active', 'paused', 'ended');

  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'marketplace listing not found' USING ERRCODE = 'P0002';
  END IF;

  -- Owners must not report their own marketplace listing.
  IF owner_id = uid THEN
    RAISE EXCEPTION 'cannot report own listing' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ad_reports (ad_id, reporter_id, reason, details)
  VALUES (p_ad_id, uid, reason_text, details_text)
  ON CONFLICT (ad_id, reporter_id) DO NOTHING
  RETURNING id INTO new_id;

  IF new_id IS NULL THEN
    UPDATE public.ad_reports
    SET reason = reason_text,
        details = details_text,
        status = 'open'
    WHERE ad_id = p_ad_id
      AND reporter_id = uid
    RETURNING id INTO new_id;
  ELSE
    UPDATE public.ads
    SET reported_count = COALESCE(reported_count, 0) + 1
    WHERE id = p_ad_id
      AND listing_surface = 'marketplace';
  END IF;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_listing_report(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_marketplace_listing_report(bigint, text, text) TO authenticated;
