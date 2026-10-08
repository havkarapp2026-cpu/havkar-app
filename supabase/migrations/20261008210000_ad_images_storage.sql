-- Dedicated public Storage bucket for future marketplace advertisement images.
-- Existing public.ads rows are not inserted, updated, or deleted.
-- Existing data URLs in public.ads.photos stay where they are.
-- No advertisement image is copied, moved, or removed.
--
-- Orphaned uploads and deleted advertisements:
-- An upload can succeed before the advertisement row is saved, and a
-- later advertisement deletion does not reference storage.objects.
-- This migration does not add a delete trigger or cleanup job.
-- Removing those files needs a separate, explicit review so an
-- in-use image cannot be removed automatically.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'ad-images',
  'ad-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types
WHERE
  storage.buckets.id = 'ad-images';

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

CREATE POLICY ad_images_delete_own_directory
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ad-images'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  AND cardinality(storage.foldername(name)) = 1
);
