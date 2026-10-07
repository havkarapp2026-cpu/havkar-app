-- Replace the function so retry_after does not depend on polymorphic greatest().

CREATE OR REPLACE FUNCTION public.consume_translation_budget(
  p_kind text,
  p_client_ip text,
  p_requests integer,
  p_characters integer
)
RETURNS TABLE (
  allowed boolean,
  retry_after integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ip text;
  v_epoch bigint;
  v_window bigint;
  v_window_start timestamp with time zone;
  v_retry integer;
  v_global_key text;
  v_ip_key text;
  v_ip_max_requests integer;
  v_ip_max_characters integer;
  v_global_max_requests integer;
  v_global_max_characters integer;
  v_global_ok boolean;
  v_ip_ok boolean;
BEGIN
  IF p_kind IS NULL
     OR p_kind NOT IN ('post', 'languages')
     OR p_requests IS DISTINCT FROM 1
     OR p_client_ip IS NULL
     OR pg_catalog.length(p_client_ip) < 3
     OR pg_catalog.length(p_client_ip) > 45
     OR p_client_ip !~ '^[0-9A-Fa-f:.]+$'
  THEN
    RAISE EXCEPTION 'invalid translation rate request'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_ip := pg_catalog.host(p_client_ip::pg_catalog.inet);
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid translation rate request'
        USING ERRCODE = '22023';
  END;

  IF v_ip IS NULL OR v_ip = '' OR pg_catalog.strpos(v_ip, '/') > 0 THEN
    RAISE EXCEPTION 'invalid translation rate request'
      USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'post' THEN
    IF p_characters IS NULL
       OR p_characters < 0
       OR p_characters > 30000
    THEN
      RAISE EXCEPTION 'invalid translation rate request'
        USING ERRCODE = '22023';
    END IF;

    v_ip_max_requests := 60;
    v_ip_max_characters := 60000;
    v_global_max_requests := 2147483647;
    v_global_max_characters := 300000;
  ELSE
    IF p_characters IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'invalid translation rate request'
        USING ERRCODE = '22023';
    END IF;

    v_ip_max_requests := 20;
    v_ip_max_characters := 0;
    v_global_max_requests := 600;
    v_global_max_characters := 0;
  END IF;

  v_epoch := pg_catalog.floor(
    pg_catalog.date_part('epoch', pg_catalog.clock_timestamp())
  )::bigint;
  v_window := v_epoch / 60;
  v_window_start := pg_catalog.to_timestamp(v_window * 60);
  v_retry := (((v_window + 1) * 60) - v_epoch)::integer;

  IF v_retry < 1 THEN
    v_retry := 1;
  END IF;

  v_global_key := 'g:' || p_kind || ':' || v_window::text;
  v_ip_key := 'i:' || p_kind || ':' || v_window::text || ':' || v_ip;

  DELETE FROM public.translation_rate_buckets
  WHERE window_start < v_window_start - interval '10 minutes';

  BEGIN
    v_global_ok := NULL;

    INSERT INTO public.translation_rate_buckets AS bucket (
      bucket_key,
      window_start,
      requests,
      characters
    ) VALUES (
      v_global_key,
      v_window_start,
      p_requests,
      p_characters
    )
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= v_global_max_requests
      AND bucket.characters + EXCLUDED.characters <= v_global_max_characters
    RETURNING TRUE INTO v_global_ok;

    IF v_global_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'translation_rate_limited'
        USING ERRCODE = 'P0001';
    END IF;

    v_ip_ok := NULL;

    INSERT INTO public.translation_rate_buckets AS bucket (
      bucket_key,
      window_start,
      requests,
      characters
    ) VALUES (
      v_ip_key,
      v_window_start,
      p_requests,
      p_characters
    )
    ON CONFLICT (bucket_key) DO UPDATE
    SET requests = bucket.requests + EXCLUDED.requests,
        characters = bucket.characters + EXCLUDED.characters
    WHERE bucket.requests + EXCLUDED.requests <= v_ip_max_requests
      AND bucket.characters + EXCLUDED.characters <= v_ip_max_characters
    RETURNING TRUE INTO v_ip_ok;

    IF v_ip_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'translation_rate_limited'
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
$function$;

REVOKE ALL ON FUNCTION public.consume_translation_budget(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_translation_budget(text, text, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.consume_translation_budget(text, text, integer, integer) IS
  'Atomically consumes the shared HAVKAR translation budget. INSERT ON CONFLICT locks the bucket row. Limits are fixed in the function.';
