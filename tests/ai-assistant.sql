\set ON_ERROR_STOP on

DO $$
DECLARE
  v_row record;
BEGIN
  SET ROLE service_role;

  SELECT * INTO v_row
  FROM public.consume_ai_budget(
    '33333333-3333-4333-8333-333333333333',
    10
  );

  IF v_row.allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'service_role could not consume a new assistant budget';
  END IF;

  RESET ROLE;
END
$$;

DO $$
DECLARE
  v_user uuid := '11111111-1111-4111-8111-111111111111';
  v_row record;
  v_count integer := 0;
BEGIN
  PERFORM 1 FROM havkar_private.ai_usage_buckets LIMIT 1;

  FOR v_count IN 1..12 LOOP
    SELECT * INTO v_row
    FROM public.consume_ai_budget(v_user, 10);

    IF v_row.allowed IS NOT TRUE OR v_row.retry_after <> 0 THEN
      RAISE EXCEPTION 'expected request % to be allowed', v_count;
    END IF;
  END LOOP;

  SELECT * INTO v_row
  FROM public.consume_ai_budget(v_user, 10);

  IF v_row.allowed IS NOT FALSE OR v_row.retry_after < 1 THEN
    RAISE EXCEPTION 'expected the thirteenth request to be limited';
  END IF;

  BEGIN
    PERFORM public.consume_ai_budget(v_user, 0);
    RAISE EXCEPTION 'zero characters were accepted';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM public.consume_ai_budget(
      '22222222-2222-4222-8222-222222222222',
      10
    );
    RAISE EXCEPTION 'anon was allowed to consume the assistant budget';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
  END;
END
$$;

SELECT 'AI_ASSISTANT_BUDGET_OK';
