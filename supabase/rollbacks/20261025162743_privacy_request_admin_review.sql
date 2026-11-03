-- Rollback for supabase/migrations/20261025162743_privacy_request_admin_review.sql
-- Verified inside a staging transaction that was rolled back on 3 November 2026.
-- That preview returned the two owner policies and CHECK (status = 'requested').
-- Do not run this while any privacy_requests.status is other than requested.
-- This does not delete accounts or request rows.

DROP POLICY IF EXISTS "Administrators read privacy requests" ON public.privacy_requests;
DROP POLICY IF EXISTS "Administrators mark privacy requests in review" ON public.privacy_requests;
DROP TRIGGER IF EXISTS privacy_requests_protect_identity ON public.privacy_requests;
DROP FUNCTION IF EXISTS public.protect_privacy_request_identity();
REVOKE UPDATE (status) ON TABLE public.privacy_requests FROM authenticated;

ALTER TABLE public.privacy_requests
  DROP CONSTRAINT privacy_requests_status_check;

ALTER TABLE public.privacy_requests
  ADD CONSTRAINT privacy_requests_status_check
    CHECK (status = 'requested');
