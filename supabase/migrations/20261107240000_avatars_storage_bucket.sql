-- Public avatars bucket for profile photo upload (profile.html).
-- Path layout matches existing client code: {auth.uid()}/{filename}.{ext}
-- Does not enable payments or Mainnet.

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

DROP POLICY IF EXISTS avatars_insert_own_directory ON storage.objects;
CREATE POLICY avatars_insert_own_directory
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+\.(jpg|jpeg|png|webp)$'
);

DROP POLICY IF EXISTS avatars_select_public ON storage.objects;
CREATE POLICY avatars_select_public
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_update_own_directory ON storage.objects;
CREATE POLICY avatars_update_own_directory
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
);

DROP POLICY IF EXISTS avatars_delete_own_directory ON storage.objects;
CREATE POLICY avatars_delete_own_directory
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
);
