-- Final security hardening for PR #124 (safe, verified).
-- 1) App uses PostgREST only — remove unused pg_graphql exposure entirely.
-- 2) Revoke anon SELECT on private/sensitive tables that are not guest catalog.
-- 3) Strip client TRUNCATE (never used by the browser app).
-- Preserves authenticated RLS + public catalog SELECT (ads/events/jobs/services/etc).
-- Does not enable Mainnet or real payments.
--
-- Note: REVOKE on graphql_public.graphql is ineffective here because those
-- grants are owned by supabase_admin. Dropping unused pg_graphql is the
-- verified way to clear GraphQL schema exposure without breaking REST/RLS.

DROP EXTENSION IF EXISTS pg_graphql CASCADE;

-- Sensitive / owner-scoped tables: remove from anon REST surface.
REVOKE ALL ON TABLE public.accommodation_audit_events FROM anon;
REVOKE ALL ON TABLE public.accommodation_evidence FROM anon;
REVOKE ALL ON TABLE public.accommodation_identity_checks FROM anon;
REVOKE ALL ON TABLE public.accommodation_operators FROM anon;
REVOKE ALL ON TABLE public.accommodation_reports FROM anon;
REVOKE ALL ON TABLE public.accommodation_reviewers FROM anon;
REVOKE ALL ON TABLE public.accommodation_plans FROM anon;
REVOKE ALL ON TABLE public.ad_saves FROM anon;
REVOKE ALL ON TABLE public.service_saves FROM anon;

GRANT SELECT ON TABLE public.accommodation_audit_events TO authenticated;
GRANT SELECT ON TABLE public.accommodation_evidence TO authenticated;
GRANT SELECT ON TABLE public.accommodation_identity_checks TO authenticated;
GRANT SELECT ON TABLE public.accommodation_operators TO authenticated;
GRANT SELECT ON TABLE public.accommodation_reports TO authenticated;
GRANT SELECT ON TABLE public.accommodation_reviewers TO authenticated;
GRANT SELECT ON TABLE public.accommodation_plans TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.ad_saves TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.service_saves TO authenticated;

-- Clients never need TRUNCATE.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE ON TABLE public.%I FROM anon, authenticated',
      r.table_name
    );
  END LOOP;
END $$;

-- Intentional remaining SECURITY DEFINER EXECUTE (app RPC / public helpers):
--   public.event_interest_counts()                → anon + authenticated (events.html)
--   public.accept_delivery(bigint)                → authenticated (delivery)
--   public.update_delivery_status(bigint, text)   → authenticated (delivery)
--   public.ad_has_blocking_dependencies(bigint)   → authenticated (ad-details)
--   havkar_private.listing_is_public(uuid)        → anon + authenticated (RLS)
--   havkar_private.job_publicly_visible(bigint)   → anon + authenticated (RLS)
--
-- Leaked password protection remains BLOCKED on Free plan (requires Pro).
