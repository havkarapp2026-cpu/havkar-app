-- Local security tests for the unapproved owner proposal.
-- Requires the harness, the precheck, and the proposal, in that order.

CREATE OR REPLACE FUNCTION pg_temp.owner_jwt(p_generation bigint, p_session uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'session_id', p_session,
    'app_metadata', pg_catalog.jsonb_build_object(
      'role', 'owner',
      'role_generation', p_generation
    )
  )::text;
$$;

CREATE OR REPLACE FUNCTION pg_temp.act(p_uid uuid, p_jwt text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('havkar.test_uid', COALESCE(p_uid::text, ''), false);
  PERFORM set_config('havkar.test_jwt', COALESCE(p_jwt, ''), false);
END;
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM havkar_private.owner_identity) <> 0 THEN
    RAISE EXCEPTION 'proposal inserted an owner';
  END IF;
  IF position('email' IN pg_get_functiondef(
    'havkar_private.establish_initial_owner(uuid,uuid,text,text,text,text)'::regprocedure
  )) > 0 THEN
    RAISE EXCEPTION 'bootstrap function references email';
  END IF;
  IF position('created_at' IN pg_get_functiondef(
    'havkar_private.establish_initial_owner(uuid,uuid,text,text,text,text)'::regprocedure
  )) > 0 THEN
    RAISE EXCEPTION 'bootstrap function can order accounts';
  END IF;
  IF position('caller_matches_admin_assignment' IN pg_get_functiondef(
    'havkar_private.caller_is_admin()'::regprocedure
  )) = 0
     OR position('app_metadata' IN pg_get_functiondef(
       'havkar_private.caller_is_admin()'::regprocedure
     )) > 0 THEN
    RAISE EXCEPTION 'admin authorization is not database-backed';
  END IF;
  IF position('owner_identity' IN pg_get_functiondef(
    'havkar_private.caller_is_owner()'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'owner authorization does not read the owner row';
  END IF;
  IF has_function_privilege(
    'service_role',
    'havkar_private.establish_initial_owner(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'havkar_private.establish_initial_owner(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'havkar_private.arm_owner_recovery(uuid,uuid,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'service_role',
    'havkar_private.commit_owner_recovery(uuid,uuid,uuid,text,text,text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'bootstrap or recovery is executable by an API role';
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE 'SET ROLE service_role';
  BEGIN
    PERFORM havkar_private.establish_initial_owner(
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'owner-phrase-local-1',
      'owner-phrase-local-1',
      'recovery-code-local-01',
      'recovery-code-local-01'
    );
    RAISE EXCEPTION 'service role established an owner';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    PERFORM count(*) FROM havkar_private.owner_identity;
    RAISE EXCEPTION 'service role read owner identity';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  EXECUTE 'RESET ROLE';
END $$;

DO $$
BEGIN
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM count(*) FROM havkar_private.owner_identity;
    RAISE EXCEPTION 'authenticated read owner identity';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  EXECUTE 'RESET ROLE';
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM havkar_private.establish_initial_owner(
      '11111111-1111-4111-8111-111111111111',
      '55555555-5555-4555-8555-555555555555',
      'owner-phrase-local-1',
      'owner-phrase-local-1',
      'recovery-code-local-01',
      'recovery-code-local-01'
    );
    RAISE EXCEPTION 'mismatched owner ids were accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  IF EXISTS (SELECT 1 FROM havkar_private.owner_identity) THEN
    RAISE EXCEPTION 'failed bootstrap left an owner';
  END IF;
END $$;

DO $$
DECLARE
  seen bigint;
BEGIN
  PERFORM set_config('havkar.test_uid', '22222222-2222-4222-8222-222222222222', false);
  PERFORM set_config(
    'havkar.test_jwt',
    '{"user_metadata":{"role":"admin"},"app_metadata":{"role":"admin"}}',
    false
  );
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO seen FROM public.service_commission_entries;
  IF seen <> 0 THEN
    RAISE EXCEPTION 'jwt admin without an assignment read commission';
  END IF;
  IF public.havkar_session_is_admin() THEN
    RAISE EXCEPTION 'jwt admin without an assignment remained admin';
  END IF;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('havkar.test_uid', '44444444-4444-4444-8444-444444444444', false);
  PERFORM set_config(
    'havkar.test_jwt',
    '{"session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","user_metadata":{"role":"admin"}}',
    false
  );
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO seen FROM public.service_commission_entries;
  IF seen <> 1 THEN
    RAISE EXCEPTION 'booking customer lost the commission row';
  END IF;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('havkar.test_uid', '33333333-3333-4333-8333-333333333333', false);
  PERFORM set_config('havkar.test_jwt', '{"session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}', false);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO seen FROM public.service_commission_entries;
  IF seen <> 0 THEN
    RAISE EXCEPTION 'stranger read the commission ledger';
  END IF;
  EXECUTE 'RESET ROLE';
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    '{"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'
  );
  PERFORM public.accept_owner_identity('bootstrap');
END $$;

DO $$
BEGIN
  UPDATE havkar_private.owner_acceptance
  SET expires_at = pg_catalog.now() - interval '1 minute'
  WHERE user_id = '11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'direct acceptance edit was allowed';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;

DO $$
BEGIN
  PERFORM set_config('havkar.acceptance', 'on', true);
  PERFORM set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
  UPDATE havkar_private.owner_acceptance
  SET expires_at = pg_catalog.now() - interval '1 minute'
  WHERE user_id = '11111111-1111-4111-8111-111111111111';
  PERFORM set_config('havkar.acceptance', 'off', true);
  BEGIN
    PERFORM havkar_private.establish_initial_owner(
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'owner-phrase-local-1',
      'owner-phrase-local-1',
      'recovery-code-local-01',
      'recovery-code-local-01'
    );
    RAISE EXCEPTION 'expired acceptance established an owner';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

DO $$
DECLARE
  established uuid;
BEGIN
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    '{"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'
  );
  PERFORM public.accept_owner_identity('bootstrap');
  established := havkar_private.establish_initial_owner(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'owner-phrase-local-1',
    'owner-phrase-local-1',
    'recovery-code-local-01',
    'recovery-code-local-01'
  );
  IF established <> '11111111-1111-4111-8111-111111111111'::uuid
     OR (SELECT count(*) FROM havkar_private.owner_identity) <> 1
     OR (SELECT count(*) FROM havkar_private.bootstrap_seal) <> 1 THEN
    RAISE EXCEPTION 'initial owner was not sealed exactly once';
  END IF;
  IF (
    SELECT raw_app_meta_data
    FROM auth.users
    WHERE id = '11111111-1111-4111-8111-111111111111'
  ) <> '{"provider":"email","providers":["email"],"role":"owner","role_generation":1}'::jsonb THEN
    RAISE EXCEPTION 'owner claim did not preserve the existing provider keys';
  END IF;
  IF EXISTS (
    SELECT 1 FROM auth.sessions
    WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'old owner sessions survived establishment';
  END IF;
  INSERT INTO auth.sessions (id, user_id) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');
  BEGIN
    PERFORM havkar_private.establish_initial_owner(
      '55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555',
      'owner-phrase-local-1',
      'owner-phrase-local-1',
      'recovery-code-local-01',
      'recovery-code-local-01'
    );
    RAISE EXCEPTION 'second owner bootstrap was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  IF (SELECT count(*) FROM havkar_private.owner_identity) <> 1 THEN
    RAISE EXCEPTION 'second bootstrap changed the owner count';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO havkar_private.owner_identity (
      user_id, role_generation, phrase_hash, recovery_code_hash
    ) VALUES (
      '55555555-5555-4555-8555-555555555555',
      1,
      'hash',
      'hash'
    );
    RAISE EXCEPTION 'direct owner insert was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    DELETE FROM havkar_private.owner_identity;
    RAISE EXCEPTION 'direct owner delete was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'auth delete removed the owner';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
  IF public.havkar_account_deletion_allowed('11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'owner account was reported as deletable';
  END IF;
  IF NOT public.havkar_account_deletion_allowed('77777777-7777-4777-8777-777777777777') THEN
    RAISE EXCEPTION 'ordinary account was reported as protected';
  END IF;
END $$;

DO $$
DECLARE
  seen bigint;
BEGIN
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  );
  EXECUTE 'SET ROLE authenticated';
  IF public.havkar_session_is_owner() IS DISTINCT FROM true
     OR public.havkar_session_is_admin() THEN
    RAISE EXCEPTION 'owner gate was not separate from admin';
  END IF;
  PERFORM havkar_private.grant_admin(
    '22222222-2222-4222-8222-222222222222',
    'owner-phrase-local-1',
    1
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO auth.sessions (id, user_id) VALUES
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222')
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.act(
    '22222222-2222-4222-8222-222222222222',
    pg_catalog.jsonb_build_object(
      'session_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'app_metadata', pg_catalog.jsonb_build_object('role', 'admin', 'role_generation', 1)
    )::text
  );
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO seen FROM public.service_commission_entries;
  IF seen <> 1 OR NOT public.havkar_session_is_admin() THEN
    RAISE EXCEPTION 'assigned admin could not read through the existing policy';
  END IF;
  IF public.havkar_session_is_owner() THEN
    RAISE EXCEPTION 'assigned admin was treated as owner';
  END IF;
  SELECT count(*) INTO seen FROM public.accommodation_price_drafts;
  IF seen <> 1 THEN
    RAISE EXCEPTION 'assigned admin could not read the existing draft policy';
  END IF;
  BEGIN
    PERFORM havkar_private.grant_admin(
      '33333333-3333-4333-8333-333333333333',
      'owner-phrase-local-1',
      1
    );
    RAISE EXCEPTION 'admin granted admin';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    PERFORM havkar_private.authorize_payment_activation('owner-phrase-local-1', 1);
    RAISE EXCEPTION 'admin authorized payment activation';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  EXECUTE 'RESET ROLE';
  IF EXISTS (SELECT 1 FROM havkar_private.security_approvals) THEN
    RAISE EXCEPTION 'admin created a security approval';
  END IF;
END $$;

DO $$
DECLARE
  seen bigint;
BEGIN
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  );
  PERFORM havkar_private.grant_staff_permission(
    '33333333-3333-4333-8333-333333333333',
    'staff.read_commission',
    'owner-phrase-local-1',
    1
  );
  INSERT INTO auth.sessions (id, user_id) VALUES
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333')
  ON CONFLICT (id) DO NOTHING;
  PERFORM pg_temp.act(
    '33333333-3333-4333-8333-333333333333',
    pg_catalog.jsonb_build_object(
      'session_id', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'app_metadata', pg_catalog.jsonb_build_object('role', 'staff', 'role_generation', 1)
    )::text
  );
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO seen FROM public.service_commission_entries;
  IF seen <> 0 OR public.havkar_session_is_admin() OR public.havkar_session_is_owner() THEN
    RAISE EXCEPTION 'staff permission satisfied an owner or admin gate';
  END IF;
  EXECUTE 'RESET ROLE';
  IF NOT havkar_private.caller_has_permission('staff.read_commission') THEN
    RAISE EXCEPTION 'staff permission was not visible to its own check';
  END IF;
  IF havkar_private.caller_has_permission('admin.read_commission')
     OR havkar_private.caller_has_permission('owner.manage_admins') THEN
    RAISE EXCEPTION 'staff received an admin or owner permission';
  END IF;
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM havkar_private.approve_security_change(
      'payment_activation', 'owner-phrase-local-1', 1
    );
    RAISE EXCEPTION 'staff approved a security change';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  EXECUTE 'RESET ROLE';

  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  );
  BEGIN
    PERFORM havkar_private.grant_staff_permission(
      '22222222-2222-4222-8222-222222222222',
      'staff.read_commission',
      'owner-phrase-local-1',
      1
    );
    RAISE EXCEPTION 'admin received a staff permission';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    PERFORM havkar_private.grant_staff_permission(
      '11111111-1111-4111-8111-111111111111',
      'staff.read_commission',
      'owner-phrase-local-1',
      1
    );
    RAISE EXCEPTION 'owner received a staff permission';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    INSERT INTO havkar_private.staff_permissions (user_id, permission)
    VALUES ('22222222-2222-4222-8222-222222222222', 'staff.read_commission');
    RAISE EXCEPTION 'direct staff permission attached to admin';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

DO $$
BEGIN
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  );
  BEGIN
    PERFORM havkar_private.authorize_payment_activation('wrong-phrase-local', 1);
    RAISE EXCEPTION 'wrong phrase authorized payment';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  );
  BEGIN
    PERFORM havkar_private.authorize_payment_activation('owner-phrase-local-1', 0);
    RAISE EXCEPTION 'stale generation authorized payment';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  DELETE FROM auth.sessions
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  );
  BEGIN
    PERFORM havkar_private.authorize_payment_activation('owner-phrase-local-1', 1);
    RAISE EXCEPTION 'revoked session authorized payment';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  INSERT INTO auth.sessions (id, user_id) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');
  PERFORM havkar_private.authorize_payment_activation('owner-phrase-local-1', 1);
  IF (
    SELECT change_key FROM havkar_private.security_approvals
  ) IS DISTINCT FROM 'payment_activation' THEN
    RAISE EXCEPTION 'payment approval row was not recorded';
  END IF;
  BEGIN
    PERFORM havkar_private.approve_security_change(
      'activate_havkar', 'owner-phrase-local-1', 1
    );
    RAISE EXCEPTION 'unknown security key was stored';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      NULL;
  END;
END $$;

DO $$
DECLARE
  arm uuid;
  seen bigint;
BEGIN
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  );
  arm := havkar_private.arm_ownership_transfer(
    '55555555-5555-4555-8555-555555555555',
    '55555555-5555-4555-8555-555555555555',
    'owner-phrase-local-1',
    1
  );
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(1, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  );
  BEGIN
    PERFORM havkar_private.commit_ownership_transfer(
      arm,
      '55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555',
      'owner-phrase-local-1',
      1
    );
    RAISE EXCEPTION 'transfer committed from a different session';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  IF (SELECT user_id FROM havkar_private.owner_identity)
     <> '11111111-1111-4111-8111-111111111111'::uuid THEN
    RAISE EXCEPTION 'rejected transfer changed the owner';
  END IF;

  INSERT INTO auth.sessions (id, user_id) VALUES
    ('abababab-abab-4aba-8aba-abababababab', '11111111-1111-4111-8111-111111111111');
  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(1, 'abababab-abab-4aba-8aba-abababababab')
  );
  BEGIN
    PERFORM havkar_private.commit_ownership_transfer(
      arm,
      '55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555',
      'owner-phrase-local-1',
      1
    );
    RAISE EXCEPTION 'transfer committed from a second live session';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    pg_temp.owner_jwt(1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  );
  PERFORM havkar_private.commit_ownership_transfer(
    arm,
    '55555555-5555-4555-8555-555555555555',
    '55555555-5555-4555-8555-555555555555',
    'owner-phrase-local-1',
    1
  );
  BEGIN
    PERFORM havkar_private.commit_ownership_transfer(
      arm,
      '55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555',
      'owner-phrase-local-1',
      1
    );
    RAISE EXCEPTION 'transfer replay was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  SELECT count(*) INTO seen FROM havkar_private.owner_identity;
  IF seen <> 1
     OR (SELECT user_id FROM havkar_private.owner_identity)
        <> '55555555-5555-4555-8555-555555555555'::uuid
     OR (SELECT role_generation FROM havkar_private.owner_identity) <> 2 THEN
    RAISE EXCEPTION 'transfer did not leave exactly one new owner';
  END IF;
  IF EXISTS (
    SELECT 1 FROM havkar_private.role_assignments
    WHERE user_id = '55555555-5555-4555-8555-555555555555'
  ) THEN
    RAISE EXCEPTION 'new owner kept another role';
  END IF;
  INSERT INTO auth.sessions (id, user_id) VALUES
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '55555555-5555-4555-8555-555555555555')
  ON CONFLICT (id) DO NOTHING;
END $$;

DO $$
DECLARE
  arm uuid;
BEGIN
  BEGIN
    UPDATE havkar_private.owner_recovery_arm
    SET accepted_at = pg_catalog.now()
    WHERE false;
    PERFORM havkar_private.arm_owner_recovery(
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'wrong-recovery-code-01'
    );
    RAISE EXCEPTION 'wrong recovery code armed recovery';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM havkar_private.arm_owner_recovery(
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'recovery-code-local-01'
    );
    RAISE EXCEPTION 'api role armed recovery';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  EXECUTE 'RESET ROLE';
  GRANT EXECUTE ON FUNCTION havkar_private.arm_owner_recovery(uuid, uuid, text) TO authenticated;
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM havkar_private.arm_owner_recovery(
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'recovery-code-local-01'
    );
    RAISE EXCEPTION 'switched api role passed the database-session check';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  EXECUTE 'RESET ROLE';
  REVOKE EXECUTE ON FUNCTION havkar_private.arm_owner_recovery(uuid, uuid, text) FROM authenticated;
  IF EXISTS (SELECT 1 FROM havkar_private.owner_recovery_arm) THEN
    RAISE EXCEPTION 'api role left a recovery arm';
  END IF;

  arm := havkar_private.arm_owner_recovery(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'recovery-code-local-01'
  );
  BEGIN
    PERFORM havkar_private.commit_owner_recovery(
      arm,
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'recovery-code-local-01',
      'owner-phrase-local-2',
      'owner-phrase-local-2',
      'recovery-code-local-02',
      'recovery-code-local-02'
    );
    RAISE EXCEPTION 'recovery committed before identity acceptance';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  PERFORM pg_temp.act(
    '33333333-3333-4333-8333-333333333333',
    '{"session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}'
  );
  BEGIN
    PERFORM public.accept_owner_identity('recovery');
    RAISE EXCEPTION 'unarmed account accepted recovery';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  PERFORM pg_temp.act(
    '11111111-1111-4111-8111-111111111111',
    '{"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'
  );
  INSERT INTO auth.sessions (id, user_id) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111')
  ON CONFLICT (id) DO NOTHING;
  PERFORM public.accept_owner_identity('recovery');
  PERFORM havkar_private.commit_owner_recovery(
    arm,
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'recovery-code-local-01',
    'owner-phrase-local-2',
    'owner-phrase-local-2',
    'recovery-code-local-02',
    'recovery-code-local-02'
  );
  BEGIN
    PERFORM havkar_private.commit_owner_recovery(
      arm,
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'recovery-code-local-01',
      'owner-phrase-local-2',
      'owner-phrase-local-2',
      'recovery-code-local-02',
      'recovery-code-local-02'
    );
    RAISE EXCEPTION 'recovery replay was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    PERFORM havkar_private.arm_owner_recovery(
      '55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555',
      'recovery-code-local-01'
    );
    RAISE EXCEPTION 'old recovery code armed another recovery';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  IF (SELECT count(*) FROM havkar_private.owner_identity) <> 1
     OR (SELECT user_id FROM havkar_private.owner_identity)
        <> '11111111-1111-4111-8111-111111111111'::uuid
     OR (SELECT role_generation FROM havkar_private.owner_identity) <> 3 THEN
    RAISE EXCEPTION 'recovery did not restore a single owner generation';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM havkar_private.owner_identity
    WHERE phrase_hash = 'owner-phrase-local-2'
       OR recovery_code_hash = 'recovery-code-local-02'
       OR phrase_hash NOT LIKE '$2a$%'
  ) THEN
    RAISE EXCEPTION 'owner secret was stored in recoverable form';
  END IF;
  IF EXISTS (
    SELECT 1 FROM havkar_private.role_audit
    WHERE action ILIKE '%owner-phrase%'
       OR action ILIKE '%recovery-code%'
  ) THEN
    RAISE EXCEPTION 'audit stored a secret';
  END IF;
  DELETE FROM auth.users WHERE id = '77777777-7777-4777-8777-777777777777';
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE id = '77777777-7777-4777-8777-777777777777'
  ) THEN
    RAISE EXCEPTION 'ordinary account delete failed';
  END IF;
  BEGIN
    DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'owner account delete succeeded after recovery';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END $$;

INSERT INTO auth.sessions (id, user_id) VALUES
  ('99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111')
ON CONFLICT (id) DO NOTHING;

SELECT 'OWNER_SECURITY_TEST_OK' AS result;
