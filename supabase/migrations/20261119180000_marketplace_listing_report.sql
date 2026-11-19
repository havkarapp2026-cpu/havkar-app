-- Marketplace listing reports (Buy & Sell). Keeps advertising create_ad_report() unchanged.
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
  new_id bigint;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ads
    WHERE id = p_ad_id
      AND listing_surface = 'marketplace'
      AND status IN ('active', 'paused', 'ended')
  ) THEN
    RAISE EXCEPTION 'marketplace listing not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.ad_reports (ad_id, reporter_id, reason, details)
  VALUES (p_ad_id, uid, btrim(p_reason), NULLIF(btrim(COALESCE(p_details, '')), ''))
  ON CONFLICT (ad_id, reporter_id) DO NOTHING
  RETURNING id INTO new_id;

  IF new_id IS NULL THEN
    UPDATE public.ad_reports
    SET reason = btrim(p_reason),
        details = NULLIF(btrim(COALESCE(p_details, '')), ''),
        status = 'open'
    WHERE ad_id = p_ad_id
      AND reporter_id = uid
    RETURNING id INTO new_id;
  ELSE
    UPDATE public.ads
    SET reported_count = COALESCE(reported_count, 0) + 1
    WHERE id = p_ad_id;
  END IF;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_listing_report(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_marketplace_listing_report(bigint, text, text) TO authenticated;
