-- Local stand-in for the current production admin check.
-- Not applied to the HAVKAR project.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS havkar_private;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('havkar.test_uid', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('havkar.test_jwt', true), '')::jsonb;
$$;

GRANT USAGE ON SCHEMA auth, public, havkar_private TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

REVOKE ALL ON FUNCTION havkar_private.caller_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION havkar_private.caller_is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.havkar_session_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT havkar_private.caller_is_admin();
$$;

REVOKE ALL ON FUNCTION public.havkar_session_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.havkar_session_is_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.service_bookings (
  id bigint PRIMARY KEY,
  customer_id uuid NOT NULL,
  provider_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.service_commission_entries (
  id bigint PRIMARY KEY,
  booking_id bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.accommodation_price_drafts (
  property_id uuid PRIMARY KEY,
  nightly_amount_cents integer
);

ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_bookings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_bookings_select_party ON public.service_bookings;
CREATE POLICY service_bookings_select_party
  ON public.service_bookings
  FOR SELECT TO authenticated
  USING (
    customer_id = (SELECT auth.uid())
    OR provider_id = (SELECT auth.uid())
  );
ALTER TABLE public.service_commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_commission_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_price_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_price_drafts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_commission_entries_party_select ON public.service_commission_entries;
CREATE POLICY service_commission_entries_party_select
  ON public.service_commission_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_bookings booking
      WHERE booking.id = service_commission_entries.booking_id
        AND (
          booking.customer_id = (SELECT auth.uid())
          OR booking.provider_id = (SELECT auth.uid())
        )
    )
    OR havkar_private.caller_is_admin()
  );

DROP POLICY IF EXISTS accommodation_price_draft_admin_select ON public.accommodation_price_drafts;
CREATE POLICY accommodation_price_draft_admin_select
  ON public.accommodation_price_drafts
  FOR SELECT TO authenticated
  USING (havkar_private.caller_is_admin());

REVOKE ALL ON public.service_bookings, public.service_commission_entries, public.accommodation_price_drafts FROM PUBLIC, anon;
GRANT SELECT ON public.service_bookings, public.service_commission_entries, public.accommodation_price_drafts TO authenticated;

INSERT INTO auth.users (id, raw_app_meta_data) VALUES
  ('11111111-1111-4111-8111-111111111111', '{"provider":"email","providers":["email"]}'),
  ('22222222-2222-4222-8222-222222222222', '{"provider":"email","providers":["email"]}'),
  ('33333333-3333-4333-8333-333333333333', '{"provider":"email","providers":["email"]}'),
  ('44444444-4444-4444-8444-444444444444', '{"provider":"email","providers":["email"]}'),
  ('55555555-5555-4555-8555-555555555555', '{"provider":"email","providers":["email"]}'),
  ('66666666-6666-4666-8666-666666666666', '{"provider":"email","providers":["email"]}'),
  ('77777777-7777-4777-8777-777777777777', '{"provider":"email","providers":["email"]}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.service_bookings (id, customer_id, provider_id) VALUES
  (1, '44444444-4444-4444-8444-444444444444', '66666666-6666-4666-8666-666666666666');

INSERT INTO public.service_commission_entries (id, booking_id) VALUES (1, 1);
INSERT INTO public.accommodation_price_drafts (property_id, nightly_amount_cents) VALUES
  ('88888888-8888-4888-8888-888888888888', 1000);

CREATE TABLE havkar_private.ai_usage_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  requests integer NOT NULL,
  characters integer NOT NULL
);
ALTER TABLE havkar_private.ai_usage_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE havkar_private.ai_usage_buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE havkar_private.ai_usage_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.havkar_ai_budget_probe()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer FROM havkar_private.ai_usage_buckets;
$$;
REVOKE ALL ON FUNCTION public.havkar_ai_budget_probe() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.havkar_ai_budget_probe() TO service_role;

CREATE OR REPLACE FUNCTION havkar_private.accommodation_booking_enabled()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT false;
$$;
REVOKE ALL ON FUNCTION havkar_private.accommodation_booking_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION havkar_private.accommodation_booking_enabled() TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA havkar_private
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA havkar_private
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA havkar_private
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

INSERT INTO auth.sessions (id, user_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '55555555-5555-4555-8555-555555555555');
