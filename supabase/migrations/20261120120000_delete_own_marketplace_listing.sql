-- Owner-only marketplace listing delete with dependency cleanup.
-- Does not grant cross-user delete. Storage object DELETE remains own-folder only.

CREATE OR REPLACE FUNCTION public.delete_own_marketplace_listing(p_ad_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.ads%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_ad_id IS NULL OR p_ad_id <= 0 THEN
    RAISE EXCEPTION 'invalid_ad_id' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_row
  FROM public.ads
  WHERE id = p_ad_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_owner_or_missing' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.ad_saves WHERE ad_id = p_ad_id;
  DELETE FROM public.ad_comments WHERE ad_id = p_ad_id;
  DELETE FROM public.ad_reactions WHERE ad_id = p_ad_id;

  UPDATE public.conversations
     SET ad_id = NULL
   WHERE ad_id = p_ad_id;

  DELETE FROM public.ads
   WHERE id = p_ad_id
     AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'photos', COALESCE(to_jsonb(v_row.photos), '[]'::jsonb),
    'video_path', v_row.video_path,
    'user_id', v_row.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_marketplace_listing(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_marketplace_listing(bigint) TO authenticated;

-- Ensure owners can delete objects only under their own ad-images folder.
DROP POLICY IF EXISTS ad_images_delete_own_directory ON storage.objects;
CREATE POLICY ad_images_delete_own_directory
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ad-images'
  AND (SELECT auth.uid()) IS NOT NULL
  AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  AND cardinality(storage.foldername(name)) = 1
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
);
