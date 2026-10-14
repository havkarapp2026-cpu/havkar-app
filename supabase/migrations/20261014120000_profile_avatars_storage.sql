-- Profile photos for the existing public.profiles.avatar_url column.
--
-- This does not add a column, copy rows, or change any profile row.
-- Verified before writing this file:
--   public.profiles.avatar_url already exists and is nullable text.
--   Existing rows had no avatar_url value.
--   SELECT and UPDATE on profiles are already limited to auth.uid() = id.
--   No storage bucket named avatars exists.
--   ad-images, service-images, accommodation-evidence,
--   accommodation-owner, and service-dispute-evidence are not reused.
--
-- The bucket is public so Profile, Chat, Jobs, Services, and listing
-- pages can show a photo from a known user id. Anonymous object listing
-- is not granted. Authenticated users can list, upload, replace, and
-- delete only {their auth uid}/avatar.webp.
--
-- Public object URLs still serve that one file. They do not expose
-- phone, email, or the rest of the profile row.

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
  WHERE id = 'avatars';

  IF NOT FOUND THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    ) VALUES (
      'avatars',
      'avatars',
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

  IF existing_name IS DISTINCT FROM 'avatars'
     OR existing_public IS NOT TRUE
     OR existing_limit IS DISTINCT FROM 5242880
     OR existing_normalized IS DISTINCT FROM expected_normalized
  THEN
    RAISE EXCEPTION
      'avatars bucket already exists with incompatible settings (name=%, public=%, file_size_limit=%, allowed_mime_types=%)',
      existing_name,
      existing_public,
      existing_limit,
      existing_types
      USING HINT = 'This migration does not change an existing bucket.';
  END IF;
END $$;

DROP POLICY IF EXISTS avatars_insert_own_file ON storage.objects;
DROP POLICY IF EXISTS avatars_select_own_file ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own_file ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own_file ON storage.objects;

CREATE POLICY avatars_insert_own_file
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  AND cardinality(storage.foldername(name)) = 1
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.webp$'
);

CREATE POLICY avatars_select_own_file
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  AND cardinality(storage.foldername(name)) = 1
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.webp$'
);

CREATE POLICY avatars_update_own_file
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  AND cardinality(storage.foldername(name)) = 1
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.webp$'
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  AND cardinality(storage.foldername(name)) = 1
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.webp$'
);

CREATE POLICY avatars_delete_own_file
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  AND cardinality(storage.foldername(name)) = 1
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.webp$'
);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_url_storage_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_url_storage_check
  CHECK (
    avatar_url IS NULL
    OR avatar_url ~ '^https://gispovnciifgikvgpzck\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.webp(\?v=[0-9]+)?$'
  );
