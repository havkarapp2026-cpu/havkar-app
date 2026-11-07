-- Authenticated could TRUNCATE privacy_requests.
-- TRUNCATE is not restricted by row level security.
-- Keep select, insert, and status updates for administrator review.
-- This does not delete requests, accounts, or rows.
-- Do not apply this file to production until the owner approves it.

REVOKE ALL ON TABLE public.privacy_requests FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.privacy_requests TO authenticated;
GRANT UPDATE (status) ON TABLE public.privacy_requests TO authenticated;
