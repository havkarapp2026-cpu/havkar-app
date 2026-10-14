INSERT INTO auth.users (id, email_confirmed_at) VALUES
  ('11111111-1111-4111-8111-111111111111', now()),
  ('22222222-2222-4222-8222-222222222222', now()),
  ('33333333-3333-4333-8333-333333333333', now());

INSERT INTO public.services (
  provider_id, title, category, description, price, currency, status
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'Garden work',
  'home',
  'Listed garden work for commission testing.',
  10.55,
  'EUR',
  'active'
);

GRANT SELECT, INSERT, UPDATE ON public.service_bookings TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

DO $$
DECLARE
  service_id bigint;
  cash_id bigint;
  manual_id bigint;
  entry_count integer;
  entry public.service_commission_entries%ROWTYPE;
BEGIN
  SELECT id INTO service_id FROM public.services LIMIT 1;

  PERFORM set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
  PERFORM set_config('havkar.test_jwt', '{}', false);
  EXECUTE 'SET ROLE authenticated';

  BEGIN
    INSERT INTO public.service_bookings (
      service_id, customer_id, provider_id, status, payment_method, commission_bps
    ) VALUES (
      service_id,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'pending',
      'cash',
      1
    );
    RAISE EXCEPTION 'client commission was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  INSERT INTO public.service_bookings (
    service_id, customer_id, provider_id, status, payment_method
  ) VALUES (
    service_id,
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'pending',
    'cash'
  ) RETURNING id INTO cash_id;

  SELECT * INTO entry
  FROM public.service_commission_entries
  WHERE booking_id = cash_id;

  IF entry.agreed_amount_cents IS DISTINCT FROM 1055
     OR entry.customer_charge_cents IS DISTINCT FROM 1055
     OR entry.commission_bps IS DISTINCT FROM 1000
     OR entry.commission_cents IS DISTINCT FROM 106
     OR entry.provider_settlement_cents IS DISTINCT FROM 949
     OR entry.payer IS DISTINCT FROM 'provider'
     OR entry.settlement_channel IS DISTINCT FROM 'cash'
     OR entry.liability_state IS DISTINCT FROM 'recorded'
     OR entry.collection_state IS DISTINCT FROM 'uncollected'
     OR entry.processing_fee_cents IS DISTINCT FROM 0
     OR entry.tax_cents IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'cash commission snapshot mismatch';
  END IF;

  BEGIN
    UPDATE public.service_bookings
    SET status = 'completed'
    WHERE id = cash_id;
    RAISE EXCEPTION 'cash completion was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  UPDATE public.service_bookings
  SET status = 'cancelled'
  WHERE id = cash_id;

  SELECT liability_state, collection_state
  INTO entry.liability_state, entry.collection_state
  FROM public.service_commission_entries
  WHERE booking_id = cash_id;

  IF entry.liability_state IS DISTINCT FROM 'void'
     OR entry.collection_state IS DISTINCT FROM 'uncollected' THEN
    RAISE EXCEPTION 'cancelled cash commission was not void and uncollected';
  END IF;

  INSERT INTO public.service_bookings (
    service_id, customer_id, provider_id, status
  ) VALUES (
    service_id,
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'pending'
  ) RETURNING id INTO manual_id;

  IF (
    SELECT settlement_channel
    FROM public.service_commission_entries
    WHERE booking_id = manual_id
  ) IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION 'manual booking did not record a manual channel';
  END IF;

  BEGIN
    INSERT INTO public.service_commission_entries (
      booking_id,
      agreed_amount_cents,
      currency,
      customer_charge_cents,
      commission_bps,
      commission_cents,
      provider_settlement_cents,
      payer
    ) VALUES (
      manual_id, 1, 'EUR', 1, 1000, 0, 1, 'customer'
    );
    RAISE EXCEPTION 'client ledger insert was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('havkar.test_uid', '33333333-3333-4333-8333-333333333333', false);
  PERFORM set_config(
    'havkar.test_jwt',
    '{"user_metadata":{"role":"admin"},"app_metadata":{"role":"member"}}',
    false
  );
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO entry_count FROM public.service_commission_entries;
  IF entry_count <> 0 THEN
    RAISE EXCEPTION 'self-assigned admin read the commission ledger';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config(
    'havkar.test_jwt',
    '{"app_metadata":{"role":"admin"}}',
    false
  );
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO entry_count FROM public.service_commission_entries;
  IF entry_count <> 0 OR public.havkar_session_is_admin() THEN
    RAISE EXCEPTION 'jwt admin claim without an assignment read the ledger';
  END IF;

  EXECUTE 'RESET ROLE';
  INSERT INTO auth.sessions (id, user_id) VALUES (
    '33333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333'
  );
  INSERT INTO havkar_private.role_assignments (
    user_id, role, role_generation, granted_by
  ) VALUES (
    '33333333-3333-4333-8333-333333333333',
    'admin',
    1,
    '11111111-1111-4111-8111-111111111111'
  );
  INSERT INTO havkar_private.admin_permissions (user_id, permission) VALUES
    ('33333333-3333-4333-8333-333333333333', 'admin.read_commission'),
    ('33333333-3333-4333-8333-333333333333', 'admin.read_accommodation_drafts');
  PERFORM set_config(
    'havkar.test_jwt',
    '{"session_id":"33333333-3333-4333-8333-333333333333","app_metadata":{"role":"admin","role_generation":1}}',
    false
  );
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO entry_count FROM public.service_commission_entries;
  IF entry_count <> 2 THEN
    RAISE EXCEPTION 'database admin could not read both commission rows';
  END IF;

  IF public.havkar_session_is_admin() IS DISTINCT FROM true
     OR public.havkar_session_is_owner() THEN
    RAISE EXCEPTION 'database admin session was not recognized separately from owner';
  END IF;

  EXECUTE 'RESET ROLE';
END $$;

SELECT 'SERVICE_COMMISSION_TEST_OK' AS result;
