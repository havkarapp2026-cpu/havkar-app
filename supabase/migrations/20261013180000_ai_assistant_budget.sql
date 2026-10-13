-- New assistant usage budget.
-- This file does not alter existing tables, functions, or RLS policies.

CREATE SCHEMA IF NOT EXISTS havkar_private;

CREATE TABLE havkar_private.ai_usage_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamp with time zone NOT NULL,
  requests integer NOT NULL,
  characters integer NOT NULL,
  CONSTRAINT ai_usage_buckets_key_length
    CHECK (char_length(bucket_key) BETWEEN 1 AND 200),
  CONSTRAINT ai_usage_buckets_requests_nonnegative
    CHECK (requests >= 0),
  CONSTRAINT ai_usage_buckets_characters_nonnegative
    CHECK (characters >= 0)
);

CREATE INDEX ai_usage_buckets_window_start_idx
  ON havkar_private.ai_usage_buckets (window_start);

ALTER TABLE havkar_private.ai_usage_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE havkar_private.ai_usage_buckets
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE havkar_private.ai_usage_buckets IS
  'Shared HAVKAR assistant usage windows. Client roles have no policies and no privileges.';

CREATE OR REPLACE FUNCTION public.consume_ai_budget(
  p_user_id uuid,
  p_characters integer
)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_epoch bigint;
  v_hour bigint;
  v_day bigint;
  v_hour_start timestamp with time zone;
  v_day_start timestamp with time zone;
  v_hour_retry integer;
  v_day_retry integer;
  v_retry integer;
  v_ok boolean;
BEGIN
  IF p_user_id IS NULL
     OR p_characters IS NULL
     OR p_characters < 1
     OR p_characters > 2000
  THEN
    RAISE EXCEPTION 'invalid assistant budget request'
      USING ERRCODE = '22023';
  END IF;

  v_epoch := pg_catalog.floor(
    pg_catalog.date_part('epoch', pg_catalog.clock_timestamp())
  )::bigint;
  v_hour := v_epoch / 3600;
  v_day := v_epoch / 86400;
  v_hour_start := pg_catalog.to_timestamp(v_hour * 3600);
  v_day_start := pg_catalog.to_timestamp(v_day * 86400);
  v_hour_retry := ((v_hour + 1) * 3600 - v_epoch)::integer;
  v_day_retry := ((v_day + 1) * 86400 - v_epoch)::integer;

  IF v_hour_retry < 1 THEN
    v_hour_retry := 1;
  END IF;

  IF v_day_retry < 1 THEN
    v_day_retry := 1;
  END IF;

  DELETE FROM havkar_private.ai_usage_buckets
  WHERE window_start < v_day_start - interval '2 days';

  BEGIN
    v_ok := NULL;

    INSERT INTO havkar_private.ai_usage_buckets AS bucket (
      bucket_key,
      window_start,
      requests,
      characters
    ) VALUES (
      'g:d:' || v_day::text,
      v_day_start,
      1,
      p_characters
    )
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= 1500
      AND bucket.characters + EXCLUDED.characters <= 400000
    RETURNING TRUE INTO v_ok;

    IF v_ok IS NOT TRUE THEN
      v_retry := v_day_retry;
      RAISE EXCEPTION 'ai_budget_limited'
        USING ERRCODE = 'P0001';
    END IF;

    v_ok := NULL;

    INSERT INTO havkar_private.ai_usage_buckets AS bucket (
      bucket_key,
      window_start,
      requests,
      characters
    ) VALUES (
      'u:d:' || p_user_id::text || ':' || v_day::text,
      v_day_start,
      1,
      p_characters
    )
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= 30
      AND bucket.characters + EXCLUDED.characters <= 15000
    RETURNING TRUE INTO v_ok;

    IF v_ok IS NOT TRUE THEN
      v_retry := v_day_retry;
      RAISE EXCEPTION 'ai_budget_limited'
        USING ERRCODE = 'P0001';
    END IF;

    v_ok := NULL;

    INSERT INTO havkar_private.ai_usage_buckets AS bucket (
      bucket_key,
      window_start,
      requests,
      characters
    ) VALUES (
      'u:h:' || p_user_id::text || ':' || v_hour::text,
      v_hour_start,
      1,
      p_characters
    )
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= 12
      AND bucket.characters + EXCLUDED.characters <= 6000
    RETURNING TRUE INTO v_ok;

    IF v_ok IS NOT TRUE THEN
      v_retry := v_hour_retry;
      RAISE EXCEPTION 'ai_budget_limited'
        USING ERRCODE = 'P0001';
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
$$;

REVOKE ALL ON FUNCTION public.consume_ai_budget(uuid, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_ai_budget(uuid, integer)
  TO service_role;

COMMENT ON FUNCTION public.consume_ai_budget(uuid, integer) IS
  'Atomically consumes the HAVKAR assistant budget for one verified user. Limits are fixed in the function.';
