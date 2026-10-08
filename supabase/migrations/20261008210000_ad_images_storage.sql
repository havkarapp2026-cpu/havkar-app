-- Dedicated public Storage bucket for future marketplace advertisement images.
-- Existing public.ads rows are not inserted, updated, or deleted.
-- Existing data URLs in public.ads.photos stay where they are.
-- No advertisement image is copied, moved, or removed.
--
-- An existing ad-images bucket is left unchanged. If its name, public
-- flag, file size limit, or allowed MIME types differ from this
-- migration, the migration stops and reports the conflict.
--
-- Orphaned uploads and deleted advertisements:
-- An upload can succeed before the advertisement row is saved, and a
-- later advertisement deletion does not reference storage.objects.
-- This migration does not add a delete trigger or cleanup job.
-- Authenticated users receive no DELETE policy, so they cannot delete
-- advertisement images directly. Image deletion and orphan cleanup
-- need a separate design after advertisement references are verified.

DO $$
DECLARE
  existing_name text;
  existing_public boolean;
  existing_limit bigint;
  existing_types text[];
  expected_types constant text[] := ARRAY['image/jpeg', 'image/png', 'image/webp'];
  existing_normalized text[];
  expected_normalized text[];
BEGIN
  SELECT name, public, file_size_limit, allowed_mime_types
    INTO existing_name, existing_public, existing_limit, existing_types
  FROM storage.buckets
  WHERE id = 'ad-images';

  IF NOT FOUND THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    ) VALUES (
      'ad-images',
      'ad-images',
      true,
      5242880,
      expected_types
    );
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT lower(mime) ORDER BY lower(mime)), ARRAY[]::text[])
    INTO existing_normalized
  FROM unnest(existing_types) AS mime;

  SELECT COALESCE(array_agg(lower(mime) ORDER BY lower(mime)), ARRAY[]::text[])
    INTO expected_normalized
  FROM unnest(expected_types) AS mime;

  IF existing_name IS DISTINCT FROM 'ad-images'
     OR existing_public IS NOT TRUE
     OR existing_limit IS DISTINCT FROM 5242880
     OR existing_normalized IS DISTINCT FROM expected_normalized
  THEN
    RAISE EXCEPTION
      'ad-images bucket already exists with incompatible settings (name=%, public=%, file_size_limit=%, allowed_mime_types=%)',
      existing_name,
      existing_public,
      existing_limit,
      existing_types
      USING HINT = 'This migration does not change an existing bucket.';
  END IF;
END $$;

DROP POLICY IF EXISTS ad_images_insert_own_directory
  ON storage.objects;

CREATE POLICY ad_images_insert_own_directory
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ad-images'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  AND cardinality(storage.foldername(name)) = 1
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
);

DROP POLICY IF EXISTS ad_images_select_own_directory
  ON storage.objects;

CREATE POLICY ad_images_select_own_directory
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ad-images'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
);

DROP POLICY IF EXISTS ad_images_delete_own_directory
  ON storage.objects;
