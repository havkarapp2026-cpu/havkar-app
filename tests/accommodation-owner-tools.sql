DO $$
DECLARE
  property uuid;
  seen integer;
BEGIN
  IF public.havkar_accommodation_booking_enabled() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'accommodation booking was enabled';
  END IF;

  SELECT id INTO property
  FROM public.accommodation_properties
  WHERE display_name = 'Draft apartment';

  PERFORM set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
  PERFORM set_config('havkar.test_jwt', '{}', false);
  EXECUTE 'SET ROLE authenticated';

  INSERT INTO public.accommodation_availability (property_id, stay_date, state)
  VALUES (property, DATE '2026-11-01', 'blocked');

  INSERT INTO public.accommodation_price_drafts (property_id, nightly_amount_cents)
  VALUES (property, 7900);

  BEGIN
    UPDATE public.accommodation_price_drafts
    SET charge_status = 'paid'
    WHERE property_id = property;
    RAISE EXCEPTION 'draft price was charged';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  INSERT INTO public.accommodation_owner_photos (property_id, storage_path)
  VALUES (
    property,
    '11111111-1111-4111-8111-111111111111/' || property::text || '/photo/front.jpg'
  );

  INSERT INTO storage.objects (bucket_id, name)
  VALUES (
    'accommodation-owner',
    '11111111-1111-4111-8111-111111111111/' || property::text || '/photo/front.jpg'
  );

  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES (
      'accommodation-owner',
      '11111111-1111-4111-8111-111111111111/' || property::text || '/passport/front.jpg'
    );
    RAISE EXCEPTION 'identity photo path was stored';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('havkar.test_uid', '22222222-2222-4222-8222-222222222222', false);
  PERFORM set_config(
    'havkar.test_jwt',
    '{"user_metadata":{"role":"admin"}}',
    false
  );
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO seen FROM public.accommodation_availability;
  IF seen <> 0 THEN
    RAISE EXCEPTION 'another user read owner availability';
  END IF;

  SELECT count(*) INTO seen FROM public.accommodation_price_drafts;
  IF seen <> 0 THEN
    RAISE EXCEPTION 'another user read a draft price';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('havkar.test_uid', '33333333-3333-4333-8333-333333333333', false);
  PERFORM set_config('havkar.test_jwt', '{"app_metadata":{"role":"admin"}}', false);
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO seen FROM public.accommodation_availability;
  IF seen <> 0 OR public.havkar_session_is_admin() THEN
    RAISE EXCEPTION 'jwt admin claim read accommodation availability';
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

  SELECT count(*) INTO seen FROM public.accommodation_availability;
  IF seen <> 1 OR public.havkar_session_is_admin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'database admin could not read availability';
  END IF;
  IF public.havkar_session_is_owner() THEN
    RAISE EXCEPTION 'database admin was treated as owner';
  END IF;

  IF (
    SELECT charge_status
    FROM public.accommodation_price_drafts
    WHERE property_id = property
  ) IS DISTINCT FROM 'not_charged' THEN
    RAISE EXCEPTION 'draft price left the not-charged state';
  END IF;

  IF (
    SELECT count(*)
    FROM public.accommodation_listings
    WHERE publication_status = 'published'
  ) <> 0 THEN
    RAISE EXCEPTION 'a listing was published';
  END IF;

  EXECUTE 'RESET ROLE';
END $$;

SELECT 'ACCOMMODATION_OWNER_TOOLS_OK' AS result;
