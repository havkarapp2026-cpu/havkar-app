-- Rollback for supabase/migrations/20261103150000_privacy_request_privilege_revoke.sql
-- Running this restores table privileges that include TRUNCATE.
-- TRUNCATE bypasses row level security, so do not run it on production
-- unless the owner explicitly accepts that exposure again.
-- This does not delete accounts or request rows.

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.privacy_requests TO authenticated;
