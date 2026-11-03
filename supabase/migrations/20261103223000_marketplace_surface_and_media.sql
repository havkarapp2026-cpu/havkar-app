-- Separate marketplace listings from advertising without deleting rows.
-- Existing ads had no campaign flag, so they stay marketplace listings.
-- Advertising rows are only those explicitly stored as listing_surface advertising.
-- Draft marketplace rows are not public. Listing publication stays free.
-- This file does not enable Mainnet payments or mark any order paid.

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS listing_surface text,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS video_path text,
  ADD COLUMN IF NOT EXISTS video_content_type text,
  ADD COLUMN IF NOT EXISTS video_bytes integer,
  ADD COLUMN IF NOT EXISTS video_duration_seconds numeric;

UPDATE public.ads
SET listing_surface = 'marketplace'
WHERE listing_surface IS NULL;

ALTER TABLE public.ads
  ALTER COLUMN listing_surface SET DEFAULT 'marketplace',
  ALTER COLUMN listing_surface SET NOT NULL;

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_listing_surface_check;
ALTER TABLE public.ads
  ADD CONSTRAINT ads_listing_surface_check
  CHECK (listing_surface IN ('marketplace', 'advertising'));

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_currency_check;
ALTER TABLE public.ads
  ADD CONSTRAINT ads_currency_check
  CHECK (currency IS NULL OR currency IN ('EUR', 'USD'));

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_video_type_check;
ALTER TABLE public.ads
  ADD CONSTRAINT ads_video_type_check
  CHECK (
    video_content_type IS NULL
    OR video_content_type IN ('video/mp4', 'video/webm')
  );

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_video_bytes_check;
ALTER TABLE public.ads
  ADD CONSTRAINT ads_video_bytes_check
  CHECK (video_bytes IS NULL OR (video_bytes > 0 AND video_bytes <= 15728640));

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_video_duration_check;
ALTER TABLE public.ads
  ADD CONSTRAINT ads_video_duration_check
  CHECK (
    video_duration_seconds IS NULL
    OR (video_duration_seconds > 0 AND video_duration_seconds <= 30)
  );

CREATE OR REPLACE FUNCTION public.enforce_ad_listing_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  normalized text;
  surface text;
BEGIN
  surface := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.listing_surface, '')));

  IF surface NOT IN ('marketplace', 'advertising') THEN
    RAISE EXCEPTION 'invalid listing surface'
      USING ERRCODE = '23514';
  END IF;

  NEW.listing_surface := surface;
  normalized := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.status, '')));

  IF surface = 'advertising' THEN
    IF TG_OP = 'INSERT' AND normalized NOT IN ('', 'active') THEN
      RAISE EXCEPTION 'new advertisements must use status active'
        USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.status := 'active';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'advertisement status cannot be changed'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF normalized IN ('', 'draft') THEN
      NEW.status := 'draft';
    ELSIF normalized = 'active' THEN
      NEW.status := 'active';
    ELSE
      RAISE EXCEPTION 'marketplace listings must use status draft or active'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.video_path IS NOT NULL THEN
    IF NEW.user_id IS NULL
       OR position(NEW.user_id::text || '/' IN NEW.video_path) <> 1
       OR position('..' IN NEW.video_path) > 0
    THEN
      RAISE EXCEPTION 'listing video path is not owned by this user'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_ad_listing_status
  ON public.ads;

CREATE TRIGGER enforce_ad_listing_status
BEFORE INSERT OR UPDATE ON public.ads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ad_listing_status();

DROP POLICY IF EXISTS "Allow public read ads" ON public.ads;
CREATE POLICY "Allow public read ads"
ON public.ads
FOR SELECT
TO anon, authenticated
USING (
  (
    listing_surface = 'advertising'
    AND (
      status IS NULL
      OR pg_catalog.btrim(status) = ''
      OR pg_catalog.lower(pg_catalog.btrim(status)) = 'active'
    )
  )
  OR (
    listing_surface = 'marketplace'
    AND pg_catalog.lower(pg_catalog.btrim(COALESCE(status, ''))) = 'active'
    AND (expires_at IS NULL OR expires_at > pg_catalog.now())
  )
  OR (SELECT auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.ads;
CREATE POLICY "Enable read access for all users"
ON public.ads
FOR SELECT
TO public
USING (
  (
    listing_surface = 'advertising'
    AND (
      status IS NULL
      OR pg_catalog.btrim(status) = ''
      OR pg_catalog.lower(pg_catalog.btrim(status)) = 'active'
    )
  )
  OR (
    listing_surface = 'marketplace'
    AND pg_catalog.lower(pg_catalog.btrim(COALESCE(status, ''))) = 'active'
    AND (expires_at IS NULL OR expires_at > pg_catalog.now())
  )
  OR (SELECT auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.ads;
CREATE POLICY "Enable insert for authenticated users only"
ON public.ads
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND listing_surface IN ('marketplace', 'advertising')
  AND (
    (listing_surface = 'advertising' AND status = 'active')
    OR (listing_surface = 'marketplace' AND status IN ('draft', 'active'))
  )
);

CREATE TABLE IF NOT EXISTS public.marketplace_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  flow text NOT NULL,
  idempotency_key text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('EUR', 'USD')),
  network text NOT NULL DEFAULT 'testnet' CHECK (network = 'testnet'),
  status text NOT NULL DEFAULT 'unpaid' CHECK (status = 'unpaid'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (user_id, idempotency_key)
);

ALTER TABLE public.marketplace_payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their unpaid marketplace intents"
  ON public.marketplace_payment_intents;
CREATE POLICY "Users read their unpaid marketplace intents"
ON public.marketplace_payment_intents
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.marketplace_payment_intents FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.marketplace_payment_intents TO authenticated;
GRANT ALL ON TABLE public.marketplace_payment_intents TO service_role;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
SELECT
  'marketplace-media',
  'marketplace-media',
  false,
  15728640,
  ARRAY['video/mp4', 'video/webm']
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'marketplace-media'
);

DROP POLICY IF EXISTS marketplace_media_insert_own ON storage.objects;
CREATE POLICY marketplace_media_insert_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'marketplace-media'
  AND (SELECT auth.uid()) IS NOT NULL
  AND name LIKE (SELECT auth.uid())::text || '/%'
  AND position('..' IN name) = 0
);

DROP POLICY IF EXISTS marketplace_media_select_own_or_active ON storage.objects;
CREATE POLICY marketplace_media_select_own_or_active
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'marketplace-media'
  AND position('..' IN name) = 0
  AND (
    (
      (SELECT auth.uid()) IS NOT NULL
      AND name LIKE (SELECT auth.uid())::text || '/%'
    )
    OR EXISTS (
      SELECT 1
      FROM public.ads AS listing
      WHERE listing.video_path = storage.objects.name
        AND listing.listing_surface = 'marketplace'
        AND pg_catalog.lower(pg_catalog.btrim(COALESCE(listing.status, ''))) = 'active'
        AND (listing.expires_at IS NULL OR listing.expires_at > pg_catalog.now())
    )
  )
);

DROP POLICY IF EXISTS marketplace_media_delete_own ON storage.objects;
CREATE POLICY marketplace_media_delete_own
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'marketplace-media'
  AND (SELECT auth.uid()) IS NOT NULL
  AND name LIKE (SELECT auth.uid())::text || '/%'
);
