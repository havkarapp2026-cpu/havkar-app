-- Queue an account-deletion or data-export request.
-- Inserting a row does not delete the account or payment records.
-- Do not apply this file to production until the owner approves it.

CREATE TABLE public.privacy_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privacy_requests_type_check
    CHECK (request_type IN ('deletion', 'export')),
  CONSTRAINT privacy_requests_status_check
    CHECK (status = 'requested')
);

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own privacy requests"
ON public.privacy_requests
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND request_type IN ('deletion', 'export')
  AND status = 'requested'
);

CREATE POLICY "Users read their own privacy requests"
ON public.privacy_requests
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.privacy_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.privacy_requests TO authenticated;
GRANT ALL ON TABLE public.privacy_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.privacy_requests_id_seq TO authenticated, service_role;
