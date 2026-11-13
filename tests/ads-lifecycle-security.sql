-- Ads lifecycle security regression. Expects prelude + migration already applied.

CREATE OR REPLACE FUNCTION havkar_private.assert_raises(p_sql text, p_label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'blocked_ok: % (%)', p_label, SQLERRM;
      RETURN;
  END;
  RAISE EXCEPTION 'expected failure did not occur: %', p_label;
END;
$$;

DO $$
DECLARE
  owner_id uuid := '11111111-1111-4111-8111-111111111111';
  reporter_id uuid := '22222222-2222-4222-8222-222222222222';
  stranger_id uuid := '33333333-3333-4333-8333-333333333333';
  admin_id uuid := '44444444-4444-4444-8444-444444444444';
  pending_id bigint;
  live_id bigint;
  future_id bigint;
  market_id bigint;
  created_id bigint;
  report_a bigint;
  report_b bigint;
  reported integer;
  visible_count integer;
  pol_count integer;
  status_val text;
  surface_val text;
  notes_val text;
  can_execute boolean;
BEGIN
  INSERT INTO auth.users (id) VALUES
    (owner_id), (reporter_id), (stranger_id), (admin_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.business_applications (user_id, business_name, status)
  VALUES (owner_id, 'Approved Cafe', 'approved');

  -- Seed fixtures as table owner (bypass RLS). Trigger still runs; service/superuser
  -- may set active/pending explicitly after insert when needed.
  INSERT INTO public.ads (title, category, description, user_id, listing_surface, status)
  VALUES ('Pending Ad', 'restaurant', 'wait', owner_id, 'advertising', 'pending_review')
  RETURNING id INTO pending_id;
  UPDATE public.ads SET status = 'pending_review' WHERE id = pending_id;

  INSERT INTO public.ads (title, category, description, user_id, listing_surface, status)
  VALUES ('Live Ad', 'shop', 'live', owner_id, 'advertising', 'active')
  RETURNING id INTO live_id;
  UPDATE public.ads SET status = 'active' WHERE id = live_id;

  INSERT INTO public.ads (
    title, category, description, user_id, listing_surface, status, starts_at, expires_at
  )
  VALUES (
    'Future Ad', 'shop', 'later', owner_id, 'advertising', 'active',
    timezone('utc', now()) + interval '2 days',
    timezone('utc', now()) + interval '10 days'
  )
  RETURNING id INTO future_id;
  UPDATE public.ads
  SET status = 'active',
      starts_at = timezone('utc', now()) + interval '2 days',
      expires_at = timezone('utc', now()) + interval '10 days'
  WHERE id = future_id;

  INSERT INTO public.ads (title, category, description, user_id, listing_surface, status)
  VALUES ('Market Lamp', 'phone', 'buy', owner_id, 'marketplace', 'active')
  RETURNING id INTO market_id;

  ------------------------------------------------------------------
  -- 1) Legacy public SELECT policies removed
  ------------------------------------------------------------------
  SELECT count(*) INTO pol_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'ads'
    AND policyname IN ('Allow public read ads', 'Enable read access for all users');
  IF pol_count <> 0 THEN
    RAISE EXCEPTION 'legacy public SELECT policies still present';
  END IF;

  SELECT count(*) INTO pol_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'ads'
    AND policyname = 'Enable insert for authenticated users only';
  IF pol_count <> 0 THEN
    RAISE EXCEPTION 'legacy INSERT policy still present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ads'
      AND policyname = 'ads_insert_authenticated'
  ) THEN
    RAISE EXCEPTION 'ads_insert_authenticated missing';
  END IF;

  ------------------------------------------------------------------
  -- 2) Schedule + moderation aware public visibility
  ------------------------------------------------------------------
  PERFORM set_config('havkar.test_uid', '', true);
  PERFORM set_config('havkar.test_jwt', '', true);
  SET LOCAL ROLE anon;

  SELECT count(*) INTO visible_count
  FROM public.ads
  WHERE id IN (pending_id, live_id, future_id, market_id);

  IF visible_count <> 2 THEN
    RAISE EXCEPTION 'anon visibility expected 2 (live+marketplace), got %', visible_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ads WHERE id = pending_id) THEN
    RAISE EXCEPTION 'pending_review must not be public';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ads WHERE id = future_id) THEN
    RAISE EXCEPTION 'future starts_at must not be public yet';
  END IF;

  RESET ROLE;

  ------------------------------------------------------------------
  -- 3) INSERT supports pending_review; client active request is forced
  ------------------------------------------------------------------
  PERFORM set_config('havkar.test_uid', owner_id::text, true);
  PERFORM set_config('havkar.test_jwt', '{}', true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.ads (title, category, description, user_id, listing_surface, status)
  VALUES ('Forced Pending', 'restaurant', 'desc', owner_id, 'advertising', 'active')
  RETURNING id INTO created_id;

  RESET ROLE;
  SELECT status INTO status_val FROM public.ads WHERE id = created_id;
  IF status_val <> 'pending_review' THEN
    RAISE EXCEPTION 'client advertising insert must become pending_review, got %', status_val;
  END IF;

  ------------------------------------------------------------------
  -- 4) Moderation bypass: pending_review -> paused -> active blocked
  ------------------------------------------------------------------
  PERFORM set_config('havkar.test_uid', owner_id::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM havkar_private.assert_raises(
    format('UPDATE public.ads SET status = %L WHERE id = %s', 'paused', pending_id),
    'pending_review -> paused'
  );
  PERFORM havkar_private.assert_raises(
    format('UPDATE public.ads SET status = %L WHERE id = %s', 'active', pending_id),
    'pending_review -> active'
  );

  -- Approved path: active <-> paused still allowed for owner.
  EXECUTE format('UPDATE public.ads SET status = %L WHERE id = %s', 'paused', live_id);
  EXECUTE format('UPDATE public.ads SET status = %L WHERE id = %s', 'active', live_id);

  -- pending_review may only end/withdraw.
  EXECUTE format('UPDATE public.ads SET status = %L WHERE id = %s', 'ended', pending_id);

  ------------------------------------------------------------------
  -- 5) listing_surface flip blocked for owners
  ------------------------------------------------------------------
  PERFORM havkar_private.assert_raises(
    format(
      'UPDATE public.ads SET listing_surface = %L WHERE id = %s',
      'marketplace',
      live_id
    ),
    'advertising -> marketplace flip'
  );
  PERFORM havkar_private.assert_raises(
    format(
      'UPDATE public.ads SET listing_surface = %L, status = %L WHERE id = %s',
      'advertising',
      'pending_review',
      market_id
    ),
    'marketplace -> advertising flip'
  );

  ------------------------------------------------------------------
  -- 6) Owner cannot write moderation_notes / reported_count
  ------------------------------------------------------------------
  PERFORM havkar_private.assert_raises(
    format(
      'UPDATE public.ads SET moderation_notes = %L WHERE id = %s',
      'self approve',
      live_id
    ),
    'owner moderation_notes write'
  );
  PERFORM havkar_private.assert_raises(
    format(
      'UPDATE public.ads SET reported_count = %s WHERE id = %s',
      999,
      live_id
    ),
    'owner reported_count write'
  );

  RESET ROLE;

  ------------------------------------------------------------------
  -- 7) reported_count does not inflate on report re-submit
  ------------------------------------------------------------------
  PERFORM set_config('havkar.test_uid', reporter_id::text, true);
  SET LOCAL ROLE authenticated;
  report_a := public.create_ad_report(live_id, 'spam content', 'first');
  report_b := public.create_ad_report(live_id, 'spam content again', 'second');
  RESET ROLE;

  IF report_a IS DISTINCT FROM report_b THEN
    RAISE EXCEPTION 're-submit should update same report row';
  END IF;

  SELECT reported_count INTO reported FROM public.ads WHERE id = live_id;
  IF reported <> 1 THEN
    RAISE EXCEPTION 'reported_count inflation: expected 1 got %', reported;
  END IF;

  ------------------------------------------------------------------
  -- 8) Audit forgery blocked for authenticated clients
  ------------------------------------------------------------------
  SELECT has_function_privilege('authenticated', 'public.record_ad_audit_event(bigint,text,jsonb)', 'EXECUTE')
    INTO can_execute;
  IF can_execute THEN
    RAISE EXCEPTION 'authenticated must not EXECUTE record_ad_audit_event';
  END IF;

  PERFORM set_config('havkar.test_uid', stranger_id::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM havkar_private.assert_raises(
    format(
      'SELECT public.record_ad_audit_event(%s, %L, %L::jsonb)',
      live_id,
      'forged_approval',
      '{}'
    ),
    'audit forgery execute'
  );
  RESET ROLE;

  ------------------------------------------------------------------
  -- 9) Admin moderation still works and writes notes
  ------------------------------------------------------------------
  PERFORM set_config('havkar.test_uid', admin_id::text, true);
  PERFORM set_config(
    'havkar.test_jwt',
    '{"app_metadata":{"role":"admin"}}',
    true
  );
  SET LOCAL ROLE authenticated;
  PERFORM public.moderate_advertisement(created_id, 'approve', 'looks good');
  RESET ROLE;

  SELECT status, moderation_notes
    INTO status_val, notes_val
  FROM public.ads
  WHERE id = created_id;
  IF status_val <> 'active' OR notes_val <> 'looks good' THEN
    RAISE EXCEPTION 'admin approve failed: status=% notes=%', status_val, notes_val;
  END IF;

  ------------------------------------------------------------------
  -- 10) Non-advertiser cannot insert advertising rows
  ------------------------------------------------------------------
  PERFORM set_config('havkar.test_uid', stranger_id::text, true);
  PERFORM set_config('havkar.test_jwt', '{}', true);
  SET LOCAL ROLE authenticated;
  PERFORM havkar_private.assert_raises(
    format(
      $sql$
        INSERT INTO public.ads (title, category, description, user_id, listing_surface, status)
        VALUES ('Nope', 'shop', 'x', %L::uuid, 'advertising', 'pending_review')
      $sql$,
      stranger_id
    ),
    'non-advertiser insert'
  );
  RESET ROLE;

  ------------------------------------------------------------------
  -- 11) Marketplace surface unchanged for market row
  ------------------------------------------------------------------
  SELECT listing_surface INTO surface_val FROM public.ads WHERE id = market_id;
  IF surface_val <> 'marketplace' THEN
    RAISE EXCEPTION 'marketplace surface mutated unexpectedly';
  END IF;

  RAISE NOTICE 'ADS_LIFECYCLE_SECURITY_OK';
END $$;

SELECT 'ADS_LIFECYCLE_SECURITY_OK' AS marker;
