-- Events are publicly readable only when public and active.
-- The owner can still read their own event, including private or non-active rows.
-- INSERT, UPDATE, and DELETE policies are unchanged.

ALTER POLICY "Enable read access for all users"
ON public.events
USING (
  (is_public IS TRUE AND status = 'active')
  OR (SELECT auth.uid()) = user_id
);
