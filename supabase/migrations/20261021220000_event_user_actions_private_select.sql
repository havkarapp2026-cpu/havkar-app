-- Narrow the public read of event interest rows.
-- Counts stay available without user identifiers.
-- Do not apply this file to production until the owner approves it.

DROP POLICY IF EXISTS "Enable read access for all users" ON public.event_user_actions;

CREATE POLICY "Users can read their own event actions"
ON public.event_user_actions
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.event_interest_counts()
RETURNS TABLE (event_id bigint, interested_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT actions.event_id, count(*)::bigint
  FROM public.event_user_actions AS actions
  WHERE actions.action = 'interested'
  GROUP BY actions.event_id;
$$;

REVOKE ALL ON FUNCTION public.event_interest_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_interest_counts() TO anon, authenticated;
