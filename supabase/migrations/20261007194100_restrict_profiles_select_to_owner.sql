-- Profile rows are readable only by the signed-in owner.
-- The existing UPDATE policy is unchanged.

ALTER POLICY "Users can view profiles"
ON public.profiles
USING (auth.uid() = id);
