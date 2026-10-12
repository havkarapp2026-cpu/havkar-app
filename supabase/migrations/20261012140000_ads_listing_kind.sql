-- Separate Buy & Sell listings from future commercial advertisements.
-- This migration adds public.ads.listing_kind and classifies the eight
-- approved rows as buy_sell. It does not delete or rewrite advertisements,
-- photos, saves, comments, reactions, or conversations.
--
-- It must run in one transaction. Supabase apply_migration does that.
-- If the live rows are no longer exactly advertisements
-- 8, 11, 12, 13, 14, 15, 16, and 23, or the save and conversation
-- counts have changed, the transaction stops before altering the table.
--
-- Authenticated and anonymous clients can insert only buy_sell.
-- listing_kind cannot be changed after insert. A future commercial row
-- has to be inserted by a privileged role; this file does not insert one.

DO $precheck$
DECLARE
  ad_count integer;
  approved_count integer;
  save_count integer;
  conversation_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ads'
      AND column_name = 'listing_kind'
  ) THEN
    RAISE EXCEPTION
      'public.ads.listing_kind already exists; migration was not applied';
  END IF;

  SELECT count(*)
  INTO ad_count
  FROM public.ads;

  SELECT count(*)
  INTO approved_count
  FROM public.ads
  WHERE id IN (8, 11, 12, 13, 14, 15, 16, 23);

  IF ad_count <> 8 OR approved_count <> 8 THEN
    RAISE EXCEPTION
      'expected exactly advertisements 8, 11, 12, 13, 14, 15, 16 and 23, found % rows and % approved ids',
      ad_count,
      approved_count;
  END IF;

  SELECT count(*)
  INTO save_count
  FROM public.ad_saves;

  IF save_count <> 4 THEN
    RAISE EXCEPTION
      'expected 4 ad saves before listing_kind, found %',
      save_count;
  END IF;

  SELECT count(*)
  INTO conversation_count
  FROM public.conversations
  WHERE ad_id = 8;

  IF conversation_count <> 1 THEN
    RAISE EXCEPTION
      'expected 1 conversation for advertisement 8, found %',
      conversation_count;
  END IF;
END
$precheck$;

CREATE TEMP TABLE havkar_listing_kind_guard (
  id bigint PRIMARY KEY,
  photo_hash text NOT NULL,
  row_hash text NOT NULL
) ON COMMIT DROP;

INSERT INTO havkar_listing_kind_guard (
  id,
  photo_hash,
  row_hash
)
SELECT
  id,
  md5(coalesce(photos, '')),
  md5(concat_ws(
    chr(31),
    coalesce(title, ''),
    coalesce(category, ''),
    coalesce(price::text, ''),
    coalesce(location, ''),
    coalesce(description, ''),
    coalesce(user_id::text, ''),
    coalesce(status, ''),
    coalesce(country_code, ''),
    coalesce(city, ''),
    coalesce(photos, '')
  ))
FROM public.ads;

ALTER TABLE public.ads
  ADD COLUMN listing_kind text;

UPDATE public.ads
SET listing_kind = 'buy_sell'
WHERE id IN (8, 11, 12, 13, 14, 15, 16, 23);

ALTER TABLE public.ads
  ALTER COLUMN listing_kind SET DEFAULT 'buy_sell';

ALTER TABLE public.ads
  ALTER COLUMN listing_kind SET NOT NULL;

ALTER TABLE public.ads
  ADD CONSTRAINT ads_listing_kind_check
  CHECK (
    listing_kind = ANY (
      ARRAY['buy_sell'::text, 'commercial'::text]
    )
  );

COMMENT ON COLUMN public.ads.listing_kind IS
  'buy_sell is a marketplace listing. commercial is reserved for a future approved campaign. Normal clients cannot change this after insert.';

CREATE INDEX ads_listing_kind_created_at_idx
  ON public.ads (listing_kind, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_ad_listing_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.listing_kind IS NULL
       OR pg_catalog.btrim(NEW.listing_kind) = '' THEN
      NEW.listing_kind := 'buy_sell';
    END IF;

    IF current_user IN ('anon', 'authenticated')
       AND NEW.listing_kind IS DISTINCT FROM 'buy_sell' THEN
      RAISE EXCEPTION 'new listings must use listing kind buy_sell'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.listing_kind IS DISTINCT FROM OLD.listing_kind THEN
    RAISE EXCEPTION 'listing kind cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_ad_listing_kind()
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enforce_ad_listing_kind()
  TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_ad_listing_kind
  ON public.ads;

CREATE TRIGGER enforce_ad_listing_kind
BEFORE INSERT OR UPDATE ON public.ads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ad_listing_kind();

DO $verify$
DECLARE
  save_count integer;
  conversation_count integer;
  buy_sell_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ads AS ad
    JOIN havkar_listing_kind_guard AS guard
      ON guard.id = ad.id
    WHERE md5(coalesce(ad.photos, ''))
          IS DISTINCT FROM guard.photo_hash
       OR md5(concat_ws(
            chr(31),
            coalesce(ad.title, ''),
            coalesce(ad.category, ''),
            coalesce(ad.price::text, ''),
            coalesce(ad.location, ''),
            coalesce(ad.description, ''),
            coalesce(ad.user_id::text, ''),
            coalesce(ad.status, ''),
            coalesce(ad.country_code, ''),
            coalesce(ad.city, ''),
            coalesce(ad.photos, '')
          )) IS DISTINCT FROM guard.row_hash
       OR ad.listing_kind IS DISTINCT FROM 'buy_sell'
  ) THEN
    RAISE EXCEPTION
      'listing_kind migration changed an existing advertisement or left one unclassified';
  END IF;

  SELECT count(*)
  INTO buy_sell_count
  FROM public.ads
  WHERE listing_kind = 'buy_sell';

  IF buy_sell_count <> 8 THEN
    RAISE EXCEPTION
      'expected 8 buy_sell advertisements, found %',
      buy_sell_count;
  END IF;

  SELECT count(*)
  INTO save_count
  FROM public.ad_saves;

  SELECT count(*)
  INTO conversation_count
  FROM public.conversations
  WHERE ad_id = 8;

  IF save_count <> 4 OR conversation_count <> 1 THEN
    RAISE EXCEPTION
      'listing_kind migration changed saves (%) or advertisement 8 conversations (%)',
      save_count,
      conversation_count;
  END IF;
END
$verify$;
