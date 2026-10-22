-- Legacy review text is readable by anyone because the original
-- SELECT policies use USING (true) for anon and authenticated.
-- reviews.html does not render these rows. Verified service reviews
-- use a separate path and are not changed here.
-- No rows are updated or deleted. The author of a legacy review,
-- reply, or helpful mark can still read that row. Anonymous visitors
-- and other accounts cannot.
-- This file is not applied to production by the change that adds it.

DROP POLICY IF EXISTS "Anyone can view reviews"
  ON public.reviews;

CREATE POLICY "Users can view own reviews"
  ON public.reviews
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Anyone can view review replies"
  ON public.review_replies;

CREATE POLICY "Users can view own review replies"
  ON public.review_replies
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Anyone can view review helpful"
  ON public.review_helpful;

CREATE POLICY "Users can view own review helpful"
  ON public.review_helpful
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
