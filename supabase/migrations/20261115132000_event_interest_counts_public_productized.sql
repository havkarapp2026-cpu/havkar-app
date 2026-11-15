-- Intentionally productize public event interest aggregates for guests.
-- Returns only counts (no user ids) for publicly listed active events.
-- Does not enable payments.

CREATE OR REPLACE FUNCTION public.event_interest_counts()
RETURNS TABLE (event_id bigint, interested_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT actions.event_id, count(*)::bigint
  FROM public.event_user_actions AS actions
  INNER JOIN public.events AS ev
    ON ev.id = actions.event_id
  WHERE actions.action = 'interested'
    AND ev.is_public IS TRUE
    AND ev.status = 'active'
  GROUP BY actions.event_id;
$$;

COMMENT ON FUNCTION public.event_interest_counts() IS
  'Public aggregate interest counts for active public events only. No user identifiers. Callable by anon.';

REVOKE ALL ON FUNCTION public.event_interest_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_interest_counts() TO anon, authenticated, service_role;
