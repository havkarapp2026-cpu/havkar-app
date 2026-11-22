-- Harden owner marketplace delete: always clear RESTRICT dependents first,
-- return cleanup counts, and keep photos as a JSON array for client cleanup.

CREATE OR REPLACE FUNCTION public.delete_own_marketplace_listing(p_ad_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.ads%ROWTYPE;
  v_saves_deleted integer := 0;
  v_comments_deleted integer := 0;
  v_reactions_deleted integer := 0;
  v_conversations_cleared integer := 0;
  v_photos jsonb := '[]'::jsonb;
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

  -- Clear RESTRICT dependents even when they belong to other users.
  -- Function owner bypasses RLS; this is intentional for owner-initiated delete.
  DELETE FROM public.ad_saves WHERE ad_id = p_ad_id;
  GET DIAGNOSTICS v_saves_deleted = ROW_COUNT;

  DELETE FROM public.ad_comments WHERE ad_id = p_ad_id;
  GET DIAGNOSTICS v_comments_deleted = ROW_COUNT;

  DELETE FROM public.ad_reactions WHERE ad_id = p_ad_id;
  GET DIAGNOSTICS v_reactions_deleted = ROW_COUNT;

  UPDATE public.conversations
     SET ad_id = NULL
   WHERE ad_id = p_ad_id;
  GET DIAGNOSTICS v_conversations_cleared = ROW_COUNT;

  DELETE FROM public.ads
   WHERE id = p_ad_id
     AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_failed' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_photos := to_jsonb(COALESCE(v_row.photos, ARRAY[]::text[]));
  EXCEPTION WHEN others THEN
    v_photos := '[]'::jsonb;
  END;

  IF jsonb_typeof(v_photos) IS DISTINCT FROM 'array' THEN
    v_photos := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'photos', v_photos,
    'video_path', v_row.video_path,
    'user_id', v_row.user_id,
    'cleared', jsonb_build_object(
      'ad_saves', v_saves_deleted,
      'ad_comments', v_comments_deleted,
      'ad_reactions', v_reactions_deleted,
      'conversations', v_conversations_cleared
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_marketplace_listing(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_marketplace_listing(bigint) TO authenticated;
