-- Owner edit and delete policies already exist in production.
-- Staging had not applied them, so listing edits and deletes were rejected.
-- This does not change production rows and does not grant access to other users.

CREATE OR REPLACE FUNCTION public.ad_has_blocking_dependencies(target_ad_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.ads
    WHERE id = target_ad_id
      AND user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.ad_saves
    WHERE ad_id = target_ad_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.ad_comments
    WHERE ad_id = target_ad_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.ad_reactions
    WHERE ad_id = target_ad_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE ad_id = target_ad_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ad_has_blocking_dependencies(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_has_blocking_dependencies(bigint) TO authenticated;

DROP POLICY IF EXISTS "Owners can update their own ads" ON public.ads;
CREATE POLICY "Owners can update their own ads"
ON public.ads
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Owners can delete their own ads when nothing depends on them" ON public.ads;
CREATE POLICY "Owners can delete their own ads when nothing depends on them"
ON public.ads
FOR DELETE
TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  AND NOT public.ad_has_blocking_dependencies(id)
);
