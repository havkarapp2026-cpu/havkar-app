-- Let an administrator read a privacy request and mark it in review.
-- This does not delete the account, the request, or retained records.
-- Do not apply this file to production until the owner approves it.

ALTER TABLE public.privacy_requests
  DROP CONSTRAINT privacy_requests_status_check;

ALTER TABLE public.privacy_requests
  ADD CONSTRAINT privacy_requests_status_check
  CHECK (status IN ('requested', 'in_review'));

CREATE OR REPLACE FUNCTION public.protect_privacy_request_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.request_type IS DISTINCT FROM OLD.request_type
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'privacy request identity cannot change';
  END IF;
  IF NEW.status NOT IN ('requested', 'in_review') THEN
    RAISE EXCEPTION 'unsupported privacy request status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS privacy_requests_protect_identity ON public.privacy_requests;
CREATE TRIGGER privacy_requests_protect_identity
  BEFORE UPDATE ON public.privacy_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privacy_request_identity();

REVOKE ALL ON FUNCTION public.protect_privacy_request_identity() FROM PUBLIC, anon, authenticated;

CREATE POLICY "Administrators read privacy requests"
ON public.privacy_requests
FOR SELECT
TO authenticated
USING (havkar_private.caller_is_admin());

CREATE POLICY "Administrators mark privacy requests in review"
ON public.privacy_requests
FOR UPDATE
TO authenticated
USING (havkar_private.caller_is_admin())
WITH CHECK (
  havkar_private.caller_is_admin()
  AND status IN ('requested', 'in_review')
);

GRANT UPDATE (
  status
) ON TABLE public.privacy_requests TO authenticated;
