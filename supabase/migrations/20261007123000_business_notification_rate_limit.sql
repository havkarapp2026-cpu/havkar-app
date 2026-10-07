-- Shared HAVKAR business-notification budget.
-- Five attempts per authenticated user and application in each 10-minute window.
-- This table is separate from business_applications and from translation_rate_buckets.
-- Client roles have no policies and no privileges.
-- Only service_role may execute the function. The function owner writes the rows.

CREATE TABLE public.business_notification_rate_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamp with time zone NOT NULL,
  attempts integer NOT NULL,
  CONSTRAINT business_notification_rate_buckets_key_length
    CHECK (char_length(bucket_key) BETWEEN 1 AND 200),
  CONSTRAINT business_notification_rate_buckets_attempts_nonnegative
    CHECK (attempts >= 0)
);

CREATE INDEX business_notification_rate_buckets_window_start_idx
  ON public.business_notification_rate_buckets (window_start);

ALTER TABLE public.business_notification_rate_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_notification_rate_buckets
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.business_notification_rate_buckets IS
  'Shared HAVKAR business-notification rate windows. Client roles have no policies and no privileges.';

CREATE OR REPLACE FUNCTION public.consume_business_notification_budget(
  p_user_id uuid,
  p_application_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_epoch bigint;
  v_window bigint;
  v_window_start timestamp with time zone;
  v_key text;
  v_allowed boolean;
  v_max_attempts integer := 5;
BEGIN
  IF p_user_id IS NULL OR p_application_id IS NULL OR p_application_id < 1 THEN
    RAISE EXCEPTION 'invalid business notification rate limit arguments'
      USING ERRCODE = '22023';
  END IF;

  v_epoch := pg_catalog.floor(
    pg_catalog.date_part('epoch', pg_catalog.clock_timestamp())
  )::bigint;
  v_window := v_epoch / 600;
  v_window_start := pg_catalog.to_timestamp(v_window * 600);
  v_key := 'bn:'
    || p_user_id::text
    || ':'
    || p_application_id::text
    || ':'
    || v_window::text;

  DELETE FROM public.business_notification_rate_buckets
  WHERE window_start < v_window_start - interval '1 hour';

  v_allowed := NULL;

  INSERT INTO public.business_notification_rate_buckets AS bucket (
    bucket_key,
    window_start,
    attempts
  ) VALUES (
    v_key,
    v_window_start,
    1
  )
  ON CONFLICT (bucket_key) DO UPDATE
  SET attempts = bucket.attempts + 1
  WHERE bucket.attempts < v_max_attempts
  RETURNING TRUE INTO v_allowed;

  RETURN v_allowed IS TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_business_notification_budget(uuid, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.consume_business_notification_budget(uuid, bigint)
  TO service_role;

COMMENT ON FUNCTION public.consume_business_notification_budget(uuid, bigint) IS
  'Atomically allows 5 business-notification attempts per user and application in a 10-minute window. INSERT ON CONFLICT locks the bucket row.';
