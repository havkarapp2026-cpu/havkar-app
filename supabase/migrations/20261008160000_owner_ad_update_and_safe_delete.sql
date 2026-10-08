-- Owners may update their own ads, and may delete one only when
-- no related row still points at it.
-- Existing SELECT and INSERT policies are unchanged.
-- The ownership trigger enforce_ad_owner_write is unchanged.
-- Foreign keys are unchanged, so this migration never cascades
-- deletes into saves, comments, reactions, conversations, or messages.

CREATE OR REPLACE FUNCTION public.ad_has_blocking_dependencies(target_ad_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
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
$$;

REVOKE ALL ON FUNCTION public.ad_has_blocking_dependencies(bigint)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ad_has_blocking_dependencies(bigint)
  FROM anon;

GRANT EXECUTE ON FUNCTION public.ad_has_blocking_dependencies(bigint)
  TO authenticated;

CREATE POLICY "Owners can update their own ads"
ON public.ads
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Owners can delete their own ads when nothing depends on them"
ON public.ads
FOR DELETE
TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  AND NOT public.ad_has_blocking_dependencies(id)
);
