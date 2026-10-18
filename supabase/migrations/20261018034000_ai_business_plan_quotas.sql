-- HAVKAR AI Business plan and profitable monthly quotas.
-- Staging project keglioewbkgdabsizvys only.
-- Does not change wallets, production, or live Stripe charges.

ALTER TABLE public.ai_subscriptions
  DROP CONSTRAINT IF EXISTS ai_subscriptions_plan;

ALTER TABLE public.ai_subscriptions
  ADD CONSTRAINT ai_subscriptions_plan
  CHECK (plan_code IN ('free', 'plus', 'pro', 'business'));

CREATE OR REPLACE FUNCTION public.consume_ai_budget(
  p_user_id uuid,
  p_characters integer
)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_budget$
DECLARE
  v_epoch bigint;
  v_hour bigint;
  v_day bigint;
  v_hour_start timestamp with time zone;
  v_day_start timestamp with time zone;
  v_month text;
  v_month_start timestamp with time zone;
  v_hour_retry integer;
  v_day_retry integer;
  v_month_retry integer;
  v_retry integer;
  v_ok boolean;
  v_plan text := 'free';
  v_status text := 'free';
  v_period timestamp with time zone;
  v_hour_requests integer := 4;
  v_day_requests integer := 8;
  v_month_requests integer := 40;
  v_hour_characters integer := 6000;
  v_day_characters integer := 48000;
  v_month_characters integer := 240000;
BEGIN
  IF p_user_id IS NULL
     OR p_characters IS NULL
     OR p_characters < 1
     OR p_characters > 6000
  THEN
    RAISE EXCEPTION 'invalid assistant budget request'
      USING ERRCODE = '22023';
  END IF;

  SELECT subscription.plan_code, subscription.status, subscription.current_period_end
  INTO v_plan, v_status, v_period
  FROM public.ai_subscriptions AS subscription
  WHERE subscription.user_id = p_user_id;

  IF v_status = 'active'
     AND (v_period IS NULL OR v_period > pg_catalog.now())
  THEN
    IF v_plan = 'plus' THEN
      v_hour_requests := 8;
      v_day_requests := 20;
      v_month_requests := 240;
      v_hour_characters := 48000;
      v_day_characters := 120000;
      v_month_characters := 1440000;
    ELSIF v_plan = 'pro' THEN
      v_hour_requests := 12;
      v_day_requests := 32;
      v_month_requests := 480;
      v_hour_characters := 72000;
      v_day_characters := 192000;
      v_month_characters := 2880000;
    ELSIF v_plan = 'business' THEN
      v_hour_requests := 20;
      v_day_requests := 60;
      v_month_requests := 900;
      v_hour_characters := 120000;
      v_day_characters := 360000;
      v_month_characters := 5400000;
    END IF;
  END IF;

  v_epoch := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint;
  v_hour := v_epoch / 3600;
  v_day := v_epoch / 86400;
  v_hour_start := pg_catalog.to_timestamp(v_hour * 3600);
  v_day_start := pg_catalog.to_timestamp(v_day * 86400);
  v_month := pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_month_start := (pg_catalog.date_trunc('month', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  v_hour_retry := ((v_hour + 1) * 3600 - v_epoch)::integer;
  v_day_retry := ((v_day + 1) * 86400 - v_epoch)::integer;
  v_month_retry := GREATEST(1, pg_catalog.floor(pg_catalog.date_part('epoch', v_month_start + interval '1 month' - pg_catalog.clock_timestamp()))::integer);
  IF v_hour_retry < 1 THEN v_hour_retry := 1; END IF;
  IF v_day_retry < 1 THEN v_day_retry := 1; END IF;

  DELETE FROM havkar_private.ai_usage_buckets
  WHERE window_start < v_day_start - interval '2 days'
    AND bucket_key NOT LIKE 'u:m:%';

  BEGIN
    v_ok := NULL;
    INSERT INTO havkar_private.ai_usage_buckets AS bucket (bucket_key, window_start, requests, characters)
    VALUES ('g:d:' || v_day::text, v_day_start, 1, p_characters)
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= 1500
      AND bucket.characters + EXCLUDED.characters <= 400000
    RETURNING TRUE INTO v_ok;
    IF v_ok IS NOT TRUE THEN
      v_retry := v_day_retry;
      RAISE EXCEPTION 'ai_budget_limited' USING ERRCODE = 'P0001';
    END IF;

    v_ok := NULL;
    INSERT INTO havkar_private.ai_usage_buckets AS bucket (bucket_key, window_start, requests, characters)
    VALUES ('u:m:' || p_user_id::text || ':' || v_month, v_month_start, 1, p_characters)
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= v_month_requests
      AND bucket.characters + EXCLUDED.characters <= v_month_characters
    RETURNING TRUE INTO v_ok;
    IF v_ok IS NOT TRUE THEN
      v_retry := v_month_retry;
      RAISE EXCEPTION 'ai_budget_limited' USING ERRCODE = 'P0001';
    END IF;

    v_ok := NULL;
    INSERT INTO havkar_private.ai_usage_buckets AS bucket (bucket_key, window_start, requests, characters)
    VALUES ('u:d:' || p_user_id::text || ':' || v_day::text, v_day_start, 1, p_characters)
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= v_day_requests
      AND bucket.characters + EXCLUDED.characters <= v_day_characters
    RETURNING TRUE INTO v_ok;
    IF v_ok IS NOT TRUE THEN
      v_retry := v_day_retry;
      RAISE EXCEPTION 'ai_budget_limited' USING ERRCODE = 'P0001';
    END IF;

    v_ok := NULL;
    INSERT INTO havkar_private.ai_usage_buckets AS bucket (bucket_key, window_start, requests, characters)
    VALUES ('u:h:' || p_user_id::text || ':' || v_hour::text, v_hour_start, 1, p_characters)
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= v_hour_requests
      AND bucket.characters + EXCLUDED.characters <= v_hour_characters
    RETURNING TRUE INTO v_ok;
    IF v_ok IS NOT TRUE THEN
      v_retry := v_hour_retry;
      RAISE EXCEPTION 'ai_budget_limited' USING ERRCODE = 'P0001';
    END IF;

    allowed := TRUE;
    retry_after := 0;
    RETURN NEXT;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      allowed := FALSE;
      retry_after := v_retry;
      RETURN NEXT;
  END;
END;
$ai_budget$;

REVOKE ALL ON FUNCTION public.consume_ai_budget(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_budget(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_image_budget(
  p_user_id uuid,
  p_images integer
)
RETURNS TABLE (allowed boolean, retry_after integer, monthly_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_image$
DECLARE
  v_epoch bigint;
  v_day bigint;
  v_day_start timestamp with time zone;
  v_month text;
  v_month_start timestamp with time zone;
  v_retry integer;
  v_day_retry integer;
  v_month_retry integer;
  v_ok boolean;
  v_plan text := 'free';
  v_status text := 'free';
  v_period timestamp with time zone;
  v_limit integer := 2;
  v_day_limit integer := 1;
BEGIN
  IF p_user_id IS NULL OR p_images IS NULL OR p_images <> 1 THEN
    RAISE EXCEPTION 'invalid assistant image budget request' USING ERRCODE = '22023';
  END IF;

  SELECT subscription.plan_code, subscription.status, subscription.current_period_end
  INTO v_plan, v_status, v_period
  FROM public.ai_subscriptions AS subscription
  WHERE subscription.user_id = p_user_id;

  IF v_status = 'active' AND (v_period IS NULL OR v_period > pg_catalog.now()) THEN
    IF v_plan = 'plus' THEN
      v_limit := 20;
      v_day_limit := 3;
    ELSIF v_plan = 'pro' THEN
      v_limit := 40;
      v_day_limit := 6;
    ELSIF v_plan = 'business' THEN
      v_limit := 80;
      v_day_limit := 10;
    END IF;
  END IF;

  v_epoch := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint;
  v_day := v_epoch / 86400;
  v_day_start := pg_catalog.to_timestamp(v_day * 86400);
  v_month := pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_month_start := (pg_catalog.date_trunc('month', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  v_day_retry := ((v_day + 1) * 86400 - v_epoch)::integer;
  v_month_retry := GREATEST(1, pg_catalog.floor(pg_catalog.date_part('epoch', v_month_start + interval '1 month' - pg_catalog.clock_timestamp()))::integer);
  IF v_day_retry < 1 THEN v_day_retry := 1; END IF;

  BEGIN
    v_ok := NULL;
    INSERT INTO havkar_private.ai_image_usage AS usage (bucket_key, window_start, images)
    VALUES ('g:d:' || v_day::text, v_day_start, 1)
    ON CONFLICT (bucket_key) DO UPDATE
    SET images = usage.images + 1
    WHERE usage.images + 1 <= 40
    RETURNING TRUE INTO v_ok;
    IF v_ok IS NOT TRUE THEN
      v_retry := v_day_retry;
      RAISE EXCEPTION 'ai_image_limited' USING ERRCODE = 'P0001';
    END IF;

    v_ok := NULL;
    INSERT INTO havkar_private.ai_image_usage AS usage (bucket_key, window_start, images)
    VALUES ('u:d:' || p_user_id::text || ':' || v_day::text, v_day_start, 1)
    ON CONFLICT (bucket_key) DO UPDATE
    SET images = usage.images + 1
    WHERE usage.images + 1 <= v_day_limit
    RETURNING TRUE INTO v_ok;
    IF v_ok IS NOT TRUE THEN
      v_retry := v_day_retry;
      RAISE EXCEPTION 'ai_image_limited' USING ERRCODE = 'P0001';
    END IF;

    v_ok := NULL;
    INSERT INTO havkar_private.ai_image_usage AS usage (bucket_key, window_start, images)
    VALUES ('u:m:' || p_user_id::text || ':' || v_month, v_month_start, 1)
    ON CONFLICT (bucket_key) DO UPDATE
    SET images = usage.images + 1
    WHERE usage.images + 1 <= v_limit
    RETURNING TRUE INTO v_ok;
    IF v_ok IS NOT TRUE THEN
      v_retry := v_month_retry;
      RAISE EXCEPTION 'ai_image_limited' USING ERRCODE = 'P0001';
    END IF;

    allowed := TRUE;
    retry_after := 0;
    monthly_limit := v_limit;
    RETURN NEXT;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      allowed := FALSE;
      retry_after := v_retry;
      monthly_limit := v_limit;
      RETURN NEXT;
  END;
END;
$ai_image$;

REVOKE ALL ON FUNCTION public.consume_ai_image_budget(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_image_budget(uuid, integer) TO service_role;
