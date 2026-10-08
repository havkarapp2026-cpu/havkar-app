-- Public advertisement reads stay limited to listings that are
-- already public: NULL status, blank status, or status active.
-- Existing rows are not inserted, updated, or deleted.
-- There is no advertisement moderation workflow in this database.
-- New rows must be stored as status active.
-- Owners can still read their own rows after a future non-public
-- status exists, so owner edit and delete can still select the row.
-- Status cannot be changed through a client update.

CREATE OR REPLACE FUNCTION public.enforce_ad_listing_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  normalized text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    normalized := pg_catalog.lower(
      pg_catalog.btrim(COALESCE(NEW.status, ''))
    );

    IF normalized = '' OR normalized = 'active' THEN
      NEW.status := 'active';
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'new advertisements must use status active'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'advertisement status cannot be changed'
      USING ERRCODE = '42501';
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

DROP POLICY IF EXISTS "Allow public read ads"
  ON public.ads;

CREATE POLICY "Allow public read ads"
ON public.ads
FOR SELECT
TO anon, authenticated
USING (
  status IS NULL
  OR pg_catalog.btrim(status) = ''
  OR pg_catalog.lower(pg_catalog.btrim(status)) = 'active'
  OR (SELECT auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Enable read access for all users"
  ON public.ads;

CREATE POLICY "Enable read access for all users"
ON public.ads
FOR SELECT
TO public
USING (
  status IS NULL
  OR pg_catalog.btrim(status) = ''
  OR pg_catalog.lower(pg_catalog.btrim(status)) = 'active'
  OR (SELECT auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Enable insert for authenticated users only"
  ON public.ads;

CREATE POLICY "Enable insert for authenticated users only"
ON public.ads
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND status = 'active'
);
