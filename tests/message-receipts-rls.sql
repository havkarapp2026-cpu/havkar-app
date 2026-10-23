-- Precheck the message_receipts migration on the disposable fixture.
-- Fails closed: any unexpected success raises an exception.

DO $$
DECLARE
  receipt_count integer;
  policy_now text;
  flags_now text;
BEGIN
  SELECT count(*) INTO receipt_count FROM public.message_receipts;
  IF receipt_count <> 0 THEN
    RAISE EXCEPTION 'migration fabricated % receipts', receipt_count;
  END IF;

  SELECT string_agg(
    pol.polname || '|' || pol.polcmd::text || '|' ||
    COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || '|' ||
    COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
    E'\n'
    ORDER BY pol.polname
  )
  INTO policy_now
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.messages'::regclass;

  IF policy_now IS DISTINCT FROM (
    SELECT messages_policies FROM public.receipt_test_snapshot WHERE id = 1
  ) THEN
    RAISE EXCEPTION 'messages policies changed';
  END IF;

  SELECT string_agg(
    id::text || ':' || message_text || ':' || is_read::text,
    E'\n'
    ORDER BY id
  )
  INTO flags_now
  FROM public.messages;

  IF flags_now IS DISTINCT FROM (
    SELECT historical_flags FROM public.receipt_test_snapshot WHERE id = 1
  ) THEN
    RAISE EXCEPTION 'existing messages changed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_trigger trigger_row
    JOIN pg_class class_row ON class_row.oid = trigger_row.tgrelid
    WHERE class_row.relname = 'messages'
      AND NOT trigger_row.tgisinternal
  ) <> 0 THEN
    RAISE EXCEPTION 'a trigger was added to messages';
  END IF;

  IF (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.message_receipts'::regclass
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'receipt RLS is disabled';
  END IF;

  IF (
    SELECT relreplident
    FROM pg_class
    WHERE oid = 'public.message_receipts'::regclass
  ) <> 'f' THEN
    RAISE EXCEPTION 'receipt replica identity is not full';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_receipts'
  ) THEN
    RAISE EXCEPTION 'receipts are not in supabase_realtime';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'message_receipts'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
      AND privilege_type = 'DELETE'
  ) THEN
    RAISE EXCEPTION 'receipt delete is granted';
  END IF;

  IF (
    SELECT prosecdef
    FROM pg_proc
    WHERE proname = 'enforce_message_receipt'
  ) IS TRUE THEN
    RAISE EXCEPTION 'receipt trigger must not be security definer';
  END IF;
END $$;

DO $$
DECLARE
  recipient uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  live_id uuid := '33333333-3333-4333-8333-333333333333';
  conversation uuid := '11111111-1111-4111-8111-111111111111';
  stored_recipient uuid;
  stored_delivered timestamptz;
  stored_read timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', recipient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.message_receipts (
    message_id,
    conversation_id,
    recipient_id,
    delivered_at,
    read_at
  ) VALUES (
    live_id,
    conversation,
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '2001-01-01 00:00:00+00',
    '1999-01-01 00:00:00+00'
  );

  EXECUTE 'RESET ROLE';

  SELECT recipient_id, delivered_at, read_at
  INTO stored_recipient, stored_delivered, stored_read
  FROM public.message_receipts
  WHERE message_id = live_id;

  IF stored_recipient IS DISTINCT FROM recipient THEN
    RAISE EXCEPTION 'forged recipient was stored';
  END IF;

  IF stored_read IS NOT NULL THEN
    RAISE EXCEPTION 'insert stored a read receipt';
  END IF;

  IF stored_delivered < transaction_timestamp() - interval '2 seconds'
    OR stored_delivered > transaction_timestamp() + interval '2 seconds' THEN
    RAISE EXCEPTION 'client delivery timestamp was stored';
  END IF;

  IF stored_delivered = '2001-01-01 00:00:00+00' THEN
    RAISE EXCEPTION 'past delivery timestamp was stored';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', recipient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.message_receipts (
    message_id,
    conversation_id,
    recipient_id,
    delivered_at,
    read_at
  ) VALUES (
    live_id,
    conversation,
    recipient,
    '2002-01-01 00:00:00+00',
    NULL
  )
  ON CONFLICT (message_id, recipient_id) DO NOTHING;

  EXECUTE 'RESET ROLE';

  IF (
    SELECT delivered_at
    FROM public.message_receipts
    WHERE message_id = live_id
  ) IS DISTINCT FROM stored_delivered THEN
    RAISE EXCEPTION 'duplicate session replaced delivery time';
  END IF;

  IF (
    SELECT count(*)
    FROM public.message_receipts
    WHERE message_id = live_id
  ) <> 1 THEN
    RAISE EXCEPTION 'sessions created more than one receipt';
  END IF;
END $$;

DO $$
DECLARE
  sender uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  live_id uuid := '33333333-3333-4333-8333-333333333333';
  conversation uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', sender::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.message_receipts (
      message_id,
      conversation_id,
      recipient_id,
      delivered_at
    ) VALUES (
      live_id,
      conversation,
      sender,
      now()
    );
    RAISE EXCEPTION 'sender delivery insert was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  EXECUTE 'RESET ROLE';
END $$;

DO $$
DECLARE
  stranger uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  other_id uuid := '66666666-6666-4666-8666-666666666666';
  conversation uuid := '11111111-1111-4111-8111-111111111111';
  visible integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.message_receipts (
      message_id,
      conversation_id,
      recipient_id,
      delivered_at
    ) VALUES (
      other_id,
      conversation,
      stranger,
      now()
    );
    RAISE EXCEPTION 'stranger delivery insert was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  SELECT count(*) INTO visible FROM public.message_receipts;
  IF visible <> 0 THEN
    RAISE EXCEPTION 'stranger can read receipts';
  END IF;

  EXECUTE 'RESET ROLE';
END $$;

DO $$
DECLARE
  sender uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  live_id uuid := '33333333-3333-4333-8333-333333333333';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', sender::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  UPDATE public.message_receipts
  SET read_at = now()
  WHERE message_id = live_id;

  IF FOUND THEN
    RAISE EXCEPTION 'sender forged a read receipt';
  END IF;

  EXECUTE 'RESET ROLE';

  IF (
    SELECT read_at
    FROM public.message_receipts
    WHERE message_id = live_id
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'sender read update changed the receipt';
  END IF;
END $$;

DO $$
DECLARE
  recipient uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  live_id uuid := '33333333-3333-4333-8333-333333333333';
  first_read timestamptz;
  original_text text;
BEGIN
  SELECT message_text INTO original_text
  FROM public.messages
  WHERE id = live_id;

  PERFORM set_config('request.jwt.claim.sub', recipient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  UPDATE public.messages
  SET message_text = 'changed by receipt'
  WHERE id = live_id;

  IF FOUND THEN
    RAISE EXCEPTION 'recipient changed message content';
  END IF;

  UPDATE public.message_receipts
  SET read_at = '2099-01-01 00:00:00+00'
  WHERE message_id = live_id;

  EXECUTE 'RESET ROLE';

  SELECT read_at INTO first_read
  FROM public.message_receipts
  WHERE message_id = live_id;

  IF first_read IS NULL OR first_read > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'read receipt did not use server time';
  END IF;

  IF first_read = '2099-01-01 00:00:00+00' THEN
    RAISE EXCEPTION 'client read timestamp was stored';
  END IF;

  PERFORM pg_sleep(0.05);

  PERFORM set_config('request.jwt.claim.sub', recipient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  UPDATE public.message_receipts
  SET read_at = NULL
  WHERE message_id = live_id;

  BEGIN
    UPDATE public.message_receipts
    SET delivered_at = now() + interval '1 day'
    WHERE message_id = live_id;
    RAISE EXCEPTION 'delivery timestamp update was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    DELETE FROM public.message_receipts
    WHERE message_id = live_id;
    RAISE EXCEPTION 'authenticated delete was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  EXECUTE 'RESET ROLE';

  IF (
    SELECT read_at
    FROM public.message_receipts
    WHERE message_id = live_id
  ) IS DISTINCT FROM first_read THEN
    RAISE EXCEPTION 'read timestamp was rolled back';
  END IF;

  IF (
    SELECT message_text
    FROM public.messages
    WHERE id = live_id
  ) IS DISTINCT FROM original_text THEN
    RAISE EXCEPTION 'message text changed';
  END IF;
END $$;

DO $$
DECLARE
  live_id uuid := '33333333-3333-4333-8333-333333333333';
BEGIN
  BEGIN
    DELETE FROM public.message_receipts
    WHERE message_id = live_id;
    RAISE EXCEPTION 'owner delete was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.message_receipts
    WHERE message_id = live_id
      AND read_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'receipt row was deleted';
  END IF;
END $$;

DO $$
DECLARE
  sender uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  visible integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', sender::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO visible FROM public.message_receipts;
  EXECUTE 'RESET ROLE';

  IF visible <> 1 THEN
    RAISE EXCEPTION 'sender cannot see the conversation receipt';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE anon';

  BEGIN
    PERFORM count(*) FROM public.message_receipts;
    RAISE EXCEPTION 'anon read was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  EXECUTE 'RESET ROLE';
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.message_receipts
    WHERE message_id IN (
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666'
    )
  ) THEN
    RAISE EXCEPTION 'historical is_read rows became receipts';
  END IF;

  IF (
    SELECT is_read
    FROM public.messages
    WHERE id = '44444444-4444-4444-8444-444444444444'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'historical is_read was rewritten';
  END IF;

  IF (
    SELECT count(*)
    FROM public.messages
  ) <> 5 THEN
    RAISE EXCEPTION 'message rows were not preserved';
  END IF;
END $$;

SELECT 'MESSAGE_RECEIPTS_RLS_OK' AS result;
