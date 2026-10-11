-- Database security checks for the two PR #44 migrations on an isolated staging database.
-- Synthetic users only. No Stripe calls. Do not run this file on production.
-- Provider review checks use the public review id. booking_id is not readable by authenticated.

CREATE TABLE public.staging_results (
  check_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION public.staging_record(p_name text, p_passed boolean, p_detail text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.staging_results (check_name, passed, detail)
  VALUES (p_name, p_passed, p_detail)
  ON CONFLICT (check_name) DO UPDATE
    SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
END;
$$;

REVOKE ALL ON FUNCTION public.staging_record(text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staging_record(text, boolean, text) TO anon, authenticated, service_role;

DO $$
DECLARE
  visible integer;
  changed integer;
  job_status text;
BEGIN
  IF to_regclass('public.job_companies') IS NULL
     OR to_regclass('public.service_commission_entries') IS NULL
     OR to_regclass('public.service_completion_codes') IS NULL THEN
    PERFORM public.staging_record('migration_objects', false, 'expected tables are missing');
  ELSE
    PERFORM public.staging_record('migration_objects', true, 'jobs, bookings, and commission objects exist');
  END IF;

  SELECT status INTO job_status FROM public.jobs WHERE id = 1;
  PERFORM public.staging_record(
    'seed_job_preserved',
    job_status = 'pending_payment',
    COALESCE(job_status, 'missing')
  );

  SELECT count(*) INTO visible
  FROM storage.buckets
  WHERE id = 'ad-images'
    AND name = 'ad-images'
    AND public IS TRUE
    AND file_size_limit = 5242880
    AND allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[];
  PERFORM public.staging_record('ad_images_bucket_unchanged', visible = 1, 'matching buckets=' || visible);

  SELECT count(*) INTO visible FROM storage.buckets WHERE id IN ('service-images', 'service-dispute-evidence');
  PERFORM public.staging_record('service_buckets_created', visible = 2, 'service buckets=' || visible);

  SELECT count(*) INTO visible
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN ('ad_images_insert_own_directory', 'ad_images_select_own_directory');
  PERFORM public.staging_record('ad_images_policies_preserved', visible = 2, 'ad image policies=' || visible);

  SELECT count(*) INTO visible
  FROM pg_trigger
  WHERE tgrelid = 'public.services'::regclass
    AND tgname = 'services_updated_at'
    AND NOT tgisinternal;
  PERFORM public.staging_record('services_updated_at_preserved', visible = 1, 'triggers=' || visible);

  SELECT count(*) INTO visible
  FROM pg_trigger
  WHERE tgrelid = 'public.service_bookings'::regclass
    AND tgname = 'service_bookings_updated_at'
    AND NOT tgisinternal;
  PERFORM public.staging_record('booking_updated_at_preserved', visible = 1, 'triggers=' || visible);

  SELECT count(*) INTO visible
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('enforce_job_publication_status', 'enforce_service_booking_write');
  PERFORM public.staging_record('old_public_triggers_removed', visible = 0, 'old functions=' || visible);
END $$;

DO $$
DECLARE
  new_id bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.jobs (user_id, title, status)
  VALUES ('00000000-0000-4000-8000-000000000001', 'client pending advertisement', 'pending_payment')
  RETURNING id INTO new_id;
  PERFORM public.staging_record('client_can_insert_pending_job', new_id IS NOT NULL, 'id=' || COALESCE(new_id::text, 'null'));
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('client_can_insert_pending_job', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.jobs (user_id, title, status, expires_at)
  VALUES ('00000000-0000-4000-8000-000000000001', 'forged active advertisement', 'active', now() + interval '30 days');
  PERFORM public.staging_record('client_cannot_insert_active_job', false, 'insert succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('client_cannot_insert_active_job', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.jobs
     SET status = 'active', expires_at = now() + interval '30 days'
   WHERE id = 1;
  PERFORM public.staging_record('client_cannot_activate_unpaid_job', false, 'update succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('client_cannot_activate_unpaid_job', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  changed integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.jobs SET title = 'staging unpaid advertisement edited' WHERE id = 1;
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM public.staging_record('owner_can_edit_unpaid_job_text', changed = 1, 'rows=' || changed);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('owner_can_edit_unpaid_job_text', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  changed integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.jobs SET status = 'active' WHERE id = 1;
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM public.staging_record('other_user_cannot_activate_job', changed = 0, 'rows=' || changed);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('other_user_cannot_activate_job', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  changed integer;
BEGIN
  SET LOCAL ROLE anon;
  UPDATE public.jobs SET status = 'active' WHERE id = 1;
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM public.staging_record('anon_cannot_activate_job', changed = 0, 'rows=' || changed);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('anon_cannot_activate_job', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  changed integer;
BEGIN
  SET LOCAL ROLE service_role;
  UPDATE public.jobs
     SET status = 'active',
         expires_at = now() + interval '30 days',
         plan = 'basic',
         monthly_fee = 9.99,
         last_stripe_session_id = 'cs_staging_ordinary'
   WHERE id = 2;
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM public.staging_record('service_role_can_publish_paid_ordinary_job', changed = 1, 'rows=' || changed);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('service_role_can_publish_paid_ordinary_job', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  anon_visible integer;
  owner_visible integer;
  pending_visible integer;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO anon_visible FROM public.jobs WHERE id = 2;
  SELECT count(*) INTO pending_visible FROM public.jobs WHERE id = 1;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO owner_visible FROM public.jobs WHERE id = 1;
  PERFORM public.staging_record('anon_sees_active_unexpired_job', anon_visible = 1, 'visible=' || anon_visible);
  PERFORM public.staging_record('anon_cannot_see_unpaid_job', pending_visible = 0, 'visible=' || pending_visible);
  PERFORM public.staging_record('owner_can_see_own_unpaid_job', owner_visible = 1, 'visible=' || owner_visible);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('job_visibility', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  visible integer;
BEGIN
  SET LOCAL ROLE service_role;
  UPDATE public.jobs
     SET status = 'active', expires_at = now() - interval '1 day'
   WHERE id = 2;
  RESET ROLE;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO visible FROM public.jobs WHERE id = 2;
  PERFORM public.staging_record('anon_cannot_see_expired_job', visible = 0, 'visible=' || visible);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('anon_cannot_see_expired_job', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  legacy_id bigint;
  visible integer;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.jobs (user_id, title, status, expires_at, employer_kind)
  VALUES ('00000000-0000-4000-8000-000000000001', 'legacy active advertisement', 'active', NULL, 'ordinary')
  RETURNING id INTO legacy_id;
  RESET ROLE;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO visible FROM public.jobs WHERE id = legacy_id;
  PERFORM public.staging_record('legacy_null_expiry_stays_public', visible = 1, 'id=' || legacy_id || ' visible=' || visible);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('legacy_null_expiry_stays_public', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  company_id uuid;
  active_id bigint;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.job_companies (owner_user_id, legal_name, verification_status)
  VALUES ('00000000-0000-4000-8000-000000000001', 'Staging Company', 'unverified')
  RETURNING id INTO company_id;
  INSERT INTO public.jobs (user_id, title, status, employer_kind, company_id)
  VALUES ('00000000-0000-4000-8000-000000000001', 'unverified company advertisement', 'pending_payment', 'company', company_id)
  RETURNING id INTO active_id;
  UPDATE public.jobs SET status = 'active', expires_at = now() + interval '30 days' WHERE id = active_id;
  PERFORM public.staging_record('unverified_company_cannot_publish', false, 'activation succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('unverified_company_cannot_publish', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  company_id uuid;
  first_id bigint;
  second_id bigint;
  changed integer;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.job_companies (owner_user_id, legal_name, verification_status)
  VALUES ('00000000-0000-4000-8000-000000000001', 'Verified Staging Company', 'verified')
  RETURNING id INTO company_id;
  INSERT INTO public.job_subscriptions (
    company_id, plan_code, status, current_period_end, active_advertisement_limit
  ) VALUES (
    company_id, 'business', 'active', now() + interval '30 days', 1
  );
  INSERT INTO public.jobs (user_id, title, status, employer_kind, company_id)
  VALUES ('00000000-0000-4000-8000-000000000001', 'company advertisement one', 'pending_payment', 'company', company_id)
  RETURNING id INTO first_id;
  INSERT INTO public.jobs (user_id, title, status, employer_kind, company_id)
  VALUES ('00000000-0000-4000-8000-000000000001', 'company advertisement two', 'pending_payment', 'company', company_id)
  RETURNING id INTO second_id;
  UPDATE public.jobs SET status = 'active', expires_at = now() + interval '30 days' WHERE id = first_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM public.staging_record('verified_company_can_publish_within_limit', changed = 1, 'rows=' || changed);
  BEGIN
    UPDATE public.jobs SET status = 'active', expires_at = now() + interval '30 days' WHERE id = second_id;
    PERFORM public.staging_record('company_limit_blocks_extra_ad', false, 'second activation succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.staging_record('company_limit_blocks_extra_ad', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
  END;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('verified_company_can_publish_within_limit', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  changed integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.jobs
     SET status = 'active'
   WHERE employer_kind = 'company'
     AND status = 'pending_payment'
     AND user_id = '00000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM public.staging_record('member_cannot_self_activate_company_job', changed = 0, 'rows=' || changed);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('member_cannot_self_activate_company_job', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  booking_id bigint;
  note_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.service_bookings (service_id, customer_id, provider_id, message, status, payment_method)
  VALUES (1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'staging request', 'pending', 'online')
  RETURNING id INTO booking_id;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO note_count
  FROM public.notifications
  WHERE user_id = '00000000-0000-4000-8000-000000000003'
    AND type = 'service';
  PERFORM public.staging_record('customer_can_request_online_booking', booking_id IS NOT NULL, 'id=' || COALESCE(booking_id::text, 'null'));
  PERFORM public.staging_record('provider_receives_booking_notification', note_count >= 1, 'notes=' || note_count);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('customer_can_request_online_booking', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.service_bookings (service_id, customer_id, provider_id, status, payment_method)
  VALUES (1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', 'pending', 'online');
  PERFORM public.staging_record('booking_rejects_wrong_provider', false, 'insert succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('booking_rejects_wrong_provider', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.service_bookings (service_id, customer_id, provider_id, status, payment_method)
  VALUES (1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'accepted', 'online');
  PERFORM public.staging_record('customer_cannot_insert_accepted_booking', false, 'insert succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('customer_cannot_insert_accepted_booking', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.service_bookings (service_id, customer_id, provider_id, status, payment_method)
  VALUES (1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'pending', 'cash');
  PERFORM public.staging_record('customer_cannot_create_cash_booking', false, 'insert succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('customer_cannot_create_cash_booking', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  changed integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.service_bookings SET status = 'accepted' WHERE id = 1;
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM public.staging_record('provider_can_accept_online_booking', changed = 1, 'rows=' || changed);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('provider_can_accept_online_booking', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.service_bookings SET status = 'completed' WHERE id = 1;
  PERFORM public.staging_record('provider_cannot_mark_completed', false, 'update succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('provider_cannot_mark_completed', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.service_bookings SET status = 'completion_requested' WHERE id = 1;
  PERFORM public.staging_record('provider_cannot_request_completion_directly', false, 'update succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('provider_cannot_request_completion_directly', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.service_bookings SET message = 'rewritten request' WHERE id = 1;
  PERFORM public.staging_record('customer_cannot_rewrite_booking_message', false, 'update succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('customer_cannot_rewrite_booking_message', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.service_bookings
     SET commission_bps = 1000, commission_amount = 10
   WHERE id = 1;
  PERFORM public.staging_record('customer_cannot_set_commission', false, 'update succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('customer_cannot_set_commission', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.service_bookings
     SET completion_confirmed_at = now(), status = 'completed'
   WHERE id = 1;
  PERFORM public.staging_record('customer_cannot_confirm_completion', false, 'update succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('customer_cannot_confirm_completion', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  changed integer;
BEGIN
  SET LOCAL ROLE service_role;
  UPDATE public.service_bookings
     SET status = 'completion_requested'
   WHERE id = 1 AND status = 'accepted';
  GET DIAGNOSTICS changed = ROW_COUNT;
  UPDATE public.service_bookings
     SET status = 'completed', completion_confirmed_at = now()
   WHERE id = 1;
  PERFORM public.staging_record('service_role_can_record_completion', changed = 1, 'request rows=' || changed);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('service_role_can_record_completion', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  cash_id bigint;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.service_bookings (service_id, customer_id, provider_id, status, payment_method)
  VALUES (1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'pending', 'cash')
  RETURNING id INTO cash_id;
  UPDATE public.service_bookings SET status = 'accepted' WHERE id = cash_id;
  PERFORM public.staging_record('service_role_cannot_activate_cash', false, 'cash activation succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('service_role_cannot_activate_cash', SQLSTATE = '42501', SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  code_visible integer;
  hash_visible integer;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.service_completion_codes (booking_id, customer_id, code_hash, expires_at)
  VALUES (1, '00000000-0000-4000-8000-000000000002', 'hash-not-the-code', now() + interval '1 hour');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO code_visible FROM public.service_completion_codes WHERE booking_id = 1;
  BEGIN
    PERFORM code_hash FROM public.service_completion_codes WHERE booking_id = 1;
    hash_visible := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    hash_visible := 0;
  END;
  PERFORM public.staging_record('customer_can_see_own_completion_row', code_visible = 1, 'rows=' || code_visible);
  PERFORM public.staging_record('customer_cannot_read_completion_hash', hash_visible = 0, 'hash visible=' || hash_visible);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('completion_code_privacy', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  visible integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO visible FROM public.service_completion_codes WHERE booking_id = 1;
  PERFORM public.staging_record('provider_cannot_see_completion_code', visible = 0, 'rows=' || visible);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('provider_cannot_see_completion_code', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  row public.service_commission_entries;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.service_commission_entries (
    booking_id,
    agreed_amount_cents,
    currency,
    customer_charge_cents,
    commission_bps,
    commission_cents,
    provider_settlement_cents,
    payer,
    stripe_event_id
  ) VALUES (
    1, 10000, 'eur', 20000, 2500, 2500, 7500, 'customer', 'evt_staging_service_1'
  )
  RETURNING * INTO row;
  PERFORM public.staging_record(
    'provider_only_ten_percent_commission',
    row.agreed_amount_cents = 10000
      AND row.customer_charge_cents = 10000
      AND row.commission_bps = 1000
      AND row.commission_cents = 1000
      AND row.provider_settlement_cents = 9000
      AND row.payer = 'provider',
    format('customer=%s commission=%s provider=%s payer=%s bps=%s',
      row.customer_charge_cents, row.commission_cents, row.provider_settlement_cents, row.payer, row.commission_bps)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('provider_only_ten_percent_commission', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.service_commission_entries (
    booking_id, agreed_amount_cents, currency, customer_charge_cents,
    commission_bps, commission_cents, provider_settlement_cents, payer, stripe_event_id
  ) VALUES (
    1, 10000, 'eur', 10000, 1000, 1000, 9000, 'provider', 'evt_staging_service_1_again'
  );
  PERFORM public.staging_record('duplicate_booking_commission_rejected', false, 'second insert succeeded');
EXCEPTION WHEN unique_violation THEN
  PERFORM public.staging_record('duplicate_booking_commission_rejected', true, SQLERRM);
WHEN OTHERS THEN
  PERFORM public.staging_record('duplicate_booking_commission_rejected', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  other_booking bigint;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.service_bookings (service_id, customer_id, provider_id, status, payment_method)
  VALUES (1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'completed', 'online')
  RETURNING id INTO other_booking;
  INSERT INTO public.service_commission_entries (
    booking_id, agreed_amount_cents, currency, customer_charge_cents,
    commission_bps, commission_cents, provider_settlement_cents, payer, stripe_event_id
  ) VALUES (
    other_booking, 10000, 'eur', 10000, 1000, 1000, 9000, 'provider', 'evt_staging_service_1'
  );
  PERFORM public.staging_record('duplicate_stripe_event_rejected', false, 'duplicate event succeeded');
EXCEPTION WHEN unique_violation THEN
  PERFORM public.staging_record('duplicate_stripe_event_rejected', true, SQLERRM);
WHEN OTHERS THEN
  PERFORM public.staging_record('duplicate_stripe_event_rejected', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.service_commission_entries (
    booking_id, agreed_amount_cents, currency, customer_charge_cents,
    commission_bps, commission_cents, provider_settlement_cents, payer
  ) VALUES (1, 10000, 'eur', 10000, 1000, 1000, 9000, 'provider');
  PERFORM public.staging_record('customer_cannot_insert_commission', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM public.staging_record('customer_cannot_insert_commission', true, SQLERRM);
WHEN OTHERS THEN
  PERFORM public.staging_record('customer_cannot_insert_commission', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  review_id bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.service_reviews (booking_id, customer_id, provider_id, rating, review_text, status)
  VALUES (1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 4, 'Completed staging review', 'published')
  RETURNING id INTO review_id;
  PERFORM public.staging_record('customer_can_review_completed_booking', review_id IS NOT NULL, 'id=' || COALESCE(review_id::text, 'null'));
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('customer_can_review_completed_booking', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.service_reviews SET rating = 5 WHERE id = 1;
  PERFORM public.staging_record('provider_cannot_rewrite_rating', false, 'rating update succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('provider_cannot_rewrite_rating', SQLSTATE IN ('42501', '42703'), SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  changed integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.service_reviews SET provider_response = 'Thank you' WHERE id = 1;
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM public.staging_record('provider_can_respond_to_review', changed = 1, 'rows=' || changed);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('provider_can_respond_to_review', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  inserted integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name)
  VALUES (
    'ad-images',
    '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-0000000000aa.jpg'
  );
  GET DIAGNOSTICS inserted = ROW_COUNT;
  PERFORM public.staging_record('owner_can_insert_ad_image', inserted = 1, 'rows=' || inserted);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('owner_can_insert_ad_image', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  visible integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO visible
  FROM storage.objects
  WHERE bucket_id = 'ad-images'
    AND name = '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-0000000000aa.jpg';
  PERFORM public.staging_record('other_user_cannot_read_ad_image', visible = 0, 'rows=' || visible);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('other_user_cannot_read_ad_image', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  inserted integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('service-images', '00000000-0000-4000-8000-000000000003/photo.webp');
  GET DIAGNOSTICS inserted = ROW_COUNT;
  PERFORM public.staging_record('provider_can_insert_own_service_image', inserted = 1, 'rows=' || inserted);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('provider_can_insert_own_service_image', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('service-images', '00000000-0000-4000-8000-000000000003/intruder.webp');
  PERFORM public.staging_record('user_cannot_insert_service_image_for_another', false, 'insert succeeded');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record(
    'user_cannot_insert_service_image_for_another',
    SQLSTATE IN ('42501', 'P0001'),
    SQLSTATE || ' ' || SQLERRM
  );
END $$;

DO $$
DECLARE
  complaint_id bigint;
  inserted integer;
  outsider integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.service_complaints (booking_id, author_id, category, explanation)
  VALUES (1, '00000000-0000-4000-8000-000000000002', 'poor_service_quality', 'Staging complaint for evidence policy.')
  RETURNING id INTO complaint_id;
  INSERT INTO storage.objects (bucket_id, name)
  VALUES (
    'service-dispute-evidence',
    complaint_id::text || '/00000000-0000-4000-8000-000000000002/evidence.pdf'
  );
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES (
      'service-dispute-evidence',
      complaint_id::text || '/00000000-0000-4000-8000-000000000004/evidence.pdf'
    );
    outsider := 1;
  EXCEPTION WHEN OTHERS THEN
    outsider := 0;
  END;
  PERFORM public.staging_record('complaint_party_can_store_evidence', inserted = 1, 'rows=' || inserted);
  PERFORM public.staging_record('outsider_cannot_store_dispute_evidence', outsider = 0, 'outsider inserted=' || outsider);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('dispute_evidence_policy', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  visible integer;
  changed integer;
  before_at timestamptz;
  after_at timestamptz;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO visible FROM public.services WHERE id = 1 AND status = 'active';
  RESET ROLE;
  SELECT updated_at INTO before_at FROM public.services WHERE id = 1;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.services SET title = 'Staging service updated' WHERE id = 1;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RESET ROLE;
  SELECT updated_at INTO after_at FROM public.services WHERE id = 1;
  PERFORM public.staging_record('anon_can_read_active_service', visible = 1, 'rows=' || visible);
  PERFORM public.staging_record(
    'provider_service_update_preserved',
    changed = 1 AND after_at > before_at,
    'rows=' || changed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('existing_services_preserved', false, SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE
  deleted integer;
  remaining integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.jobs WHERE id = 2 AND user_id = '00000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RESET ROLE;
  SELECT count(*) INTO remaining FROM public.jobs WHERE id = 1;
  PERFORM public.staging_record('owner_can_still_delete_own_job', deleted = 1, 'rows=' || deleted);
  PERFORM public.staging_record('unrelated_job_not_deleted', remaining = 1, 'remaining=' || remaining);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.staging_record('owner_delete_preserved', false, SQLSTATE || ' ' || SQLERRM);
END $$;

SELECT check_name, passed, detail
FROM public.staging_results
ORDER BY passed, check_name;

DO $$
DECLARE
  failed integer;
BEGIN
  SELECT count(*) INTO failed FROM public.staging_results WHERE NOT passed;
  IF failed > 0 THEN
    RAISE EXCEPTION 'staging security tests failed: %', failed;
  END IF;
END $$;
