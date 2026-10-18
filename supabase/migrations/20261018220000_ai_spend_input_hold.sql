-- HAVKAR AI spend holds include counted input tokens, and a hold that has
-- started a provider call stays until the next UTC month if the function
-- never records the outcome. No dollar limit is seeded. No new Gemini price
-- is introduced. Cached tokens, tool-use tokens, and any remainder inside
-- total_tokens have no rate in the verified standard price rows, so those
-- calls stay unpriced.

ALTER TABLE havkar_private.ai_spend_holds
  ADD COLUMN IF NOT EXISTS provider_started boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.reserve_ai_spend(uuid, text, text, integer, integer, bigint, bigint, bigint, bigint, bigint, bigint);
DROP FUNCTION IF EXISTS public.record_ai_provider_usage(uuid, uuid, text, text, boolean, integer, integer, integer, integer, integer, integer, text);

CREATE OR REPLACE FUNCTION public.ai_spend_limit_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
  SELECT EXISTS (
    SELECT 1
    FROM havkar_private.ai_spend_limits AS limits
    WHERE limits.enabled = TRUE
  );
$ai_cost$;

REVOKE ALL ON FUNCTION public.ai_spend_limit_active() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_spend_limit_active() TO service_role;

CREATE OR REPLACE FUNCTION public.mark_ai_spend_hold_started(
  p_hold_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
BEGIN
  IF p_hold_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE havkar_private.ai_spend_holds
  SET provider_started = TRUE,
      expires_at = (
        pg_catalog.date_trunc('month', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')
        + interval '1 month'
      ) AT TIME ZONE 'UTC'
  WHERE hold_id = p_hold_id
    AND user_id = p_user_id
    AND expires_at > pg_catalog.clock_timestamp();

  RETURN FOUND;
END;
$ai_cost$;

REVOKE ALL ON FUNCTION public.mark_ai_spend_hold_started(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_ai_spend_hold_started(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_spend(
  p_user_id uuid,
  p_kind text,
  p_model text,
  p_output_cap_tokens integer,
  p_image_cap_tokens integer,
  p_user_day_micros bigint DEFAULT NULL,
  p_user_month_micros bigint DEFAULT NULL,
  p_plan_day_micros bigint DEFAULT NULL,
  p_plan_month_micros bigint DEFAULT NULL,
  p_global_day_micros bigint DEFAULT NULL,
  p_global_month_micros bigint DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL
)
RETURNS TABLE (allowed boolean, hold_id uuid, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
DECLARE
  v_plan text;
  v_input_rate bigint;
  v_text_rate bigint;
  v_image_rate bigint;
  v_published_image integer;
  v_output_cap integer;
  v_image_cap integer;
  v_input_tokens integer;
  v_hold bigint := 0;
  v_limit record;
  v_window timestamp with time zone;
  v_spent bigint;
  v_open bigint;
  v_unpriced boolean;
  v_has_limit boolean := FALSE;
BEGIN
  IF p_user_id IS NULL OR p_kind NOT IN ('text', 'image') OR p_model IS NULL THEN
    allowed := FALSE;
    hold_id := NULL;
    reason := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(87421019);
  v_plan := havkar_private.ai_active_plan(p_user_id);

  DELETE FROM havkar_private.ai_spend_holds
  WHERE expires_at <= pg_catalog.clock_timestamp();

  SELECT
    price.input_usd_micros_per_million,
    price.output_text_usd_micros_per_million,
    price.output_image_usd_micros_per_million,
    price.published_image_tokens
  INTO v_input_rate, v_text_rate, v_image_rate, v_published_image
  FROM havkar_private.ai_model_prices AS price
  WHERE price.model = p_model
    AND price.tier = 'standard';

  FOR v_limit IN
    SELECT limits.scope, limits.period, limits.limit_usd_micros
    FROM havkar_private.ai_spend_limits AS limits
    WHERE limits.enabled = TRUE
      AND (
        (limits.scope = 'global' AND limits.user_id IS NULL AND limits.plan_code IS NULL)
        OR (limits.scope = 'user' AND limits.user_id = p_user_id)
        OR (limits.scope = 'plan' AND limits.plan_code = v_plan)
      )
    UNION ALL
    SELECT 'user', 'day', p_user_day_micros
    WHERE p_user_day_micros IS NOT NULL AND p_user_day_micros >= 0
    UNION ALL
    SELECT 'user', 'month', p_user_month_micros
    WHERE p_user_month_micros IS NOT NULL AND p_user_month_micros >= 0
    UNION ALL
    SELECT 'plan', 'day', p_plan_day_micros
    WHERE p_plan_day_micros IS NOT NULL AND p_plan_day_micros >= 0
    UNION ALL
    SELECT 'plan', 'month', p_plan_month_micros
    WHERE p_plan_month_micros IS NOT NULL AND p_plan_month_micros >= 0
    UNION ALL
    SELECT 'global', 'day', p_global_day_micros
    WHERE p_global_day_micros IS NOT NULL AND p_global_day_micros >= 0
    UNION ALL
    SELECT 'global', 'month', p_global_month_micros
    WHERE p_global_month_micros IS NOT NULL AND p_global_month_micros >= 0
  LOOP
    v_has_limit := TRUE;
    IF v_limit.period = 'month' THEN
      v_window := (pg_catalog.date_trunc('month', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    ELSE
      v_window := (pg_catalog.date_trunc('day', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM havkar_private.ai_usage_events AS usage
      WHERE usage.created_at >= v_window
        AND usage.provider_called = TRUE
        AND usage.estimated_usd_micros IS NULL
        AND (
          v_limit.scope = 'global'
          OR (v_limit.scope = 'user' AND usage.user_id = p_user_id)
          OR (v_limit.scope = 'plan' AND usage.plan_code = v_plan)
        )
    ) INTO v_unpriced;

    IF v_unpriced THEN
      allowed := FALSE;
      hold_id := NULL;
      reason := 'unpriced';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT COALESCE(pg_catalog.sum(usage.estimated_usd_micros), 0)
    INTO v_spent
    FROM havkar_private.ai_usage_events AS usage
    WHERE usage.created_at >= v_window
      AND usage.estimated_usd_micros IS NOT NULL
      AND (
        v_limit.scope = 'global'
        OR (v_limit.scope = 'user' AND usage.user_id = p_user_id)
        OR (v_limit.scope = 'plan' AND usage.plan_code = v_plan)
      );

    SELECT COALESCE(pg_catalog.sum(open_hold.hold_usd_micros), 0)
    INTO v_open
    FROM havkar_private.ai_spend_holds AS open_hold
    WHERE open_hold.expires_at > pg_catalog.clock_timestamp()
      AND open_hold.created_at >= v_window
      AND (
        v_limit.scope = 'global'
        OR (v_limit.scope = 'user' AND open_hold.user_id = p_user_id)
        OR (v_limit.scope = 'plan' AND open_hold.plan_code = v_plan)
      );

    IF v_spent + v_open >= v_limit.limit_usd_micros THEN
      allowed := FALSE;
      hold_id := NULL;
      reason := v_limit.scope || '_' || v_limit.period;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  IF v_has_limit IS NOT TRUE THEN
    allowed := TRUE;
    hold_id := NULL;
    reason := 'ok';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_input_rate IS NULL OR v_text_rate IS NULL THEN
    allowed := FALSE;
    hold_id := NULL;
    reason := 'unpriced';
    RETURN NEXT;
    RETURN;
  END IF;

  v_input_tokens := p_input_tokens;
  IF v_input_tokens IS NULL OR v_input_tokens < 0 OR v_input_tokens > 10000000 THEN
    allowed := FALSE;
    hold_id := NULL;
    reason := 'unpriced';
    RETURN NEXT;
    RETURN;
  END IF;

  v_output_cap := COALESCE(p_output_cap_tokens, 0);
  v_image_cap := 0;
  IF p_kind = 'image' THEN
    v_output_cap := 0;
    v_image_cap := LEAST(
      COALESCE(v_published_image, 0),
      GREATEST(COALESCE(p_image_cap_tokens, 0), 0)
    );
    IF v_image_rate IS NULL OR v_image_cap < 1 THEN
      allowed := FALSE;
      hold_id := NULL;
      reason := 'unpriced';
      RETURN NEXT;
      RETURN;
    END IF;
  ELSIF v_output_cap < 1 OR v_output_cap > 8192 THEN
    allowed := FALSE;
    hold_id := NULL;
    reason := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  v_hold := pg_catalog.round(
    (
      v_input_tokens::numeric * v_input_rate
      + v_output_cap::numeric * v_text_rate
      + v_image_cap::numeric * COALESCE(v_image_rate, 0)
    ) / 1000000
  )::bigint;

  FOR v_limit IN
    SELECT limits.scope, limits.period, limits.limit_usd_micros
    FROM havkar_private.ai_spend_limits AS limits
    WHERE limits.enabled = TRUE
      AND (
        (limits.scope = 'global' AND limits.user_id IS NULL AND limits.plan_code IS NULL)
        OR (limits.scope = 'user' AND limits.user_id = p_user_id)
        OR (limits.scope = 'plan' AND limits.plan_code = v_plan)
      )
    UNION ALL
    SELECT 'user', 'day', p_user_day_micros
    WHERE p_user_day_micros IS NOT NULL AND p_user_day_micros >= 0
    UNION ALL
    SELECT 'user', 'month', p_user_month_micros
    WHERE p_user_month_micros IS NOT NULL AND p_user_month_micros >= 0
    UNION ALL
    SELECT 'plan', 'day', p_plan_day_micros
    WHERE p_plan_day_micros IS NOT NULL AND p_plan_day_micros >= 0
    UNION ALL
    SELECT 'plan', 'month', p_plan_month_micros
    WHERE p_plan_month_micros IS NOT NULL AND p_plan_month_micros >= 0
    UNION ALL
    SELECT 'global', 'day', p_global_day_micros
    WHERE p_global_day_micros IS NOT NULL AND p_global_day_micros >= 0
    UNION ALL
    SELECT 'global', 'month', p_global_month_micros
    WHERE p_global_month_micros IS NOT NULL AND p_global_month_micros >= 0
  LOOP
    IF v_limit.period = 'month' THEN
      v_window := (pg_catalog.date_trunc('month', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    ELSE
      v_window := (pg_catalog.date_trunc('day', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    END IF;

    SELECT COALESCE(pg_catalog.sum(usage.estimated_usd_micros), 0)
    INTO v_spent
    FROM havkar_private.ai_usage_events AS usage
    WHERE usage.created_at >= v_window
      AND usage.estimated_usd_micros IS NOT NULL
      AND (
        v_limit.scope = 'global'
        OR (v_limit.scope = 'user' AND usage.user_id = p_user_id)
        OR (v_limit.scope = 'plan' AND usage.plan_code = v_plan)
      );

    SELECT COALESCE(pg_catalog.sum(open_hold.hold_usd_micros), 0)
    INTO v_open
    FROM havkar_private.ai_spend_holds AS open_hold
    WHERE open_hold.expires_at > pg_catalog.clock_timestamp()
      AND open_hold.created_at >= v_window
      AND (
        v_limit.scope = 'global'
        OR (v_limit.scope = 'user' AND open_hold.user_id = p_user_id)
        OR (v_limit.scope = 'plan' AND open_hold.plan_code = v_plan)
      );

    IF v_spent + v_open + v_hold > v_limit.limit_usd_micros THEN
      allowed := FALSE;
      hold_id := NULL;
      reason := v_limit.scope || '_' || v_limit.period;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  hold_id := extensions.gen_random_uuid();
  INSERT INTO havkar_private.ai_spend_holds (
    hold_id, user_id, plan_code, kind, model, hold_usd_micros, expires_at
  ) VALUES (
    hold_id,
    p_user_id,
    v_plan,
    p_kind,
    p_model,
    v_hold,
    pg_catalog.clock_timestamp() + interval '75 seconds'
  );
  allowed := TRUE;
  reason := 'ok';
  RETURN NEXT;
END;
$ai_cost$;

REVOKE ALL ON FUNCTION public.reserve_ai_spend(uuid, text, text, integer, integer, bigint, bigint, bigint, bigint, bigint, bigint, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_spend(uuid, text, text, integer, integer, bigint, bigint, bigint, bigint, bigint, bigint, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_ai_provider_usage(
  p_user_id uuid,
  p_hold_id uuid,
  p_kind text,
  p_model text,
  p_provider_called boolean,
  p_http_status integer,
  p_prompt_tokens integer,
  p_output_text_tokens integer,
  p_thought_tokens integer,
  p_image_output_tokens integer,
  p_total_tokens integer,
  p_usage_source text,
  p_force_unpriced boolean DEFAULT FALSE
)
RETURNS TABLE (estimated_usd_micros bigint, recorded boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
DECLARE
  v_plan text;
  v_input_rate bigint;
  v_text_rate bigint;
  v_image_rate bigint;
  v_cost bigint;
  v_started boolean := FALSE;
  v_tokens_ok boolean := FALSE;
BEGIN
  IF p_user_id IS NULL OR p_kind NOT IN ('text', 'image') OR p_usage_source NOT IN ('provider', 'missing') THEN
    estimated_usd_micros := NULL;
    recorded := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(87421019);

  IF p_hold_id IS NOT NULL THEN
    SELECT hold.provider_started
    INTO v_started
    FROM havkar_private.ai_spend_holds AS hold
    WHERE hold.hold_id = p_hold_id
      AND hold.user_id = p_user_id;

    IF NOT FOUND THEN
      v_started := FALSE;
    END IF;

    IF p_provider_called IS TRUE OR v_started IS NOT TRUE THEN
      DELETE FROM havkar_private.ai_spend_holds
      WHERE hold_id = p_hold_id
        AND user_id = p_user_id;
    END IF;
  END IF;

  IF p_provider_called IS NOT TRUE THEN
    estimated_usd_micros := NULL;
    recorded := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  v_plan := havkar_private.ai_active_plan(p_user_id);
  v_cost := NULL;
  v_tokens_ok := p_prompt_tokens IS NOT NULL
     AND p_output_text_tokens IS NOT NULL
     AND p_image_output_tokens IS NOT NULL
     AND p_prompt_tokens BETWEEN 0 AND 10000000
     AND p_output_text_tokens BETWEEN 0 AND 10000000
     AND COALESCE(p_thought_tokens, 0) BETWEEN 0 AND 10000000
     AND p_image_output_tokens BETWEEN 0 AND 10000000
     AND (p_total_tokens IS NULL OR p_total_tokens BETWEEN 0 AND 20000000);

  IF p_usage_source = 'provider' AND v_tokens_ok AND p_force_unpriced IS NOT TRUE THEN
    SELECT
      price.input_usd_micros_per_million,
      price.output_text_usd_micros_per_million,
      price.output_image_usd_micros_per_million
    INTO v_input_rate, v_text_rate, v_image_rate
    FROM havkar_private.ai_model_prices AS price
    WHERE price.model = p_model
      AND price.tier = 'standard';

    IF v_input_rate IS NOT NULL
       AND v_text_rate IS NOT NULL
       AND (p_image_output_tokens = 0 OR v_image_rate IS NOT NULL)
       AND p_total_tokens IS NOT NULL
       AND p_total_tokens = p_prompt_tokens + p_output_text_tokens + p_image_output_tokens
    THEN
      v_cost := pg_catalog.round(
        (
          p_prompt_tokens::numeric * v_input_rate
          + p_output_text_tokens::numeric * v_text_rate
          + p_image_output_tokens::numeric * COALESCE(v_image_rate, 0)
        ) / 1000000
      )::bigint;
    END IF;
  END IF;

  INSERT INTO havkar_private.ai_usage_events (
    user_id,
    plan_code,
    kind,
    model,
    provider_called,
    http_status,
    prompt_tokens,
    output_text_tokens,
    thought_tokens,
    image_output_tokens,
    total_tokens,
    estimated_usd_micros,
    price_tier,
    usage_source
  ) VALUES (
    p_user_id,
    v_plan,
    p_kind,
    left(p_model, 80),
    TRUE,
    p_http_status,
    CASE WHEN v_tokens_ok THEN p_prompt_tokens ELSE NULL END,
    CASE WHEN v_tokens_ok THEN p_output_text_tokens ELSE NULL END,
    CASE WHEN v_tokens_ok THEN p_thought_tokens ELSE NULL END,
    CASE WHEN v_tokens_ok THEN p_image_output_tokens ELSE NULL END,
    CASE WHEN v_tokens_ok THEN p_total_tokens ELSE NULL END,
    v_cost,
    CASE WHEN v_cost IS NULL THEN NULL ELSE 'standard' END,
    CASE WHEN v_cost IS NULL THEN 'missing' ELSE 'provider' END
  );

  estimated_usd_micros := v_cost;
  recorded := TRUE;
  RETURN NEXT;
END;
$ai_cost$;

REVOKE ALL ON FUNCTION public.record_ai_provider_usage(uuid, uuid, text, text, boolean, integer, integer, integer, integer, integer, integer, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_provider_usage(uuid, uuid, text, text, boolean, integer, integer, integer, integer, integer, integer, text, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.ai_spend_limit_reached(
  p_user_id uuid,
  p_user_day_micros bigint DEFAULT NULL,
  p_user_month_micros bigint DEFAULT NULL,
  p_plan_day_micros bigint DEFAULT NULL,
  p_plan_month_micros bigint DEFAULT NULL,
  p_global_day_micros bigint DEFAULT NULL,
  p_global_month_micros bigint DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
DECLARE
  v_plan text;
  v_limit record;
  v_window timestamp with time zone;
  v_spent bigint;
  v_open bigint;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN TRUE;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(87421019);
  v_plan := havkar_private.ai_active_plan(p_user_id);

  FOR v_limit IN
    SELECT limits.scope, limits.period, limits.limit_usd_micros
    FROM havkar_private.ai_spend_limits AS limits
    WHERE limits.enabled = TRUE
      AND (
        (limits.scope = 'global' AND limits.user_id IS NULL AND limits.plan_code IS NULL)
        OR (limits.scope = 'user' AND limits.user_id = p_user_id)
        OR (limits.scope = 'plan' AND limits.plan_code = v_plan)
      )
    UNION ALL
    SELECT 'user', 'day', p_user_day_micros
    WHERE p_user_day_micros IS NOT NULL AND p_user_day_micros >= 0
    UNION ALL
    SELECT 'user', 'month', p_user_month_micros
    WHERE p_user_month_micros IS NOT NULL AND p_user_month_micros >= 0
    UNION ALL
    SELECT 'plan', 'day', p_plan_day_micros
    WHERE p_plan_day_micros IS NOT NULL AND p_plan_day_micros >= 0
    UNION ALL
    SELECT 'plan', 'month', p_plan_month_micros
    WHERE p_plan_month_micros IS NOT NULL AND p_plan_month_micros >= 0
    UNION ALL
    SELECT 'global', 'day', p_global_day_micros
    WHERE p_global_day_micros IS NOT NULL AND p_global_day_micros >= 0
    UNION ALL
    SELECT 'global', 'month', p_global_month_micros
    WHERE p_global_month_micros IS NOT NULL AND p_global_month_micros >= 0
  LOOP
    IF v_limit.period = 'month' THEN
      v_window := (pg_catalog.date_trunc('month', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    ELSE
      v_window := (pg_catalog.date_trunc('day', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM havkar_private.ai_usage_events AS usage
      WHERE usage.created_at >= v_window
        AND usage.provider_called = TRUE
        AND usage.estimated_usd_micros IS NULL
        AND (
          v_limit.scope = 'global'
          OR (v_limit.scope = 'user' AND usage.user_id = p_user_id)
          OR (v_limit.scope = 'plan' AND usage.plan_code = v_plan)
        )
    ) THEN
      RETURN TRUE;
    END IF;

    SELECT COALESCE(pg_catalog.sum(usage.estimated_usd_micros), 0)
    INTO v_spent
    FROM havkar_private.ai_usage_events AS usage
    WHERE usage.created_at >= v_window
      AND usage.estimated_usd_micros IS NOT NULL
      AND (
        v_limit.scope = 'global'
        OR (v_limit.scope = 'user' AND usage.user_id = p_user_id)
        OR (v_limit.scope = 'plan' AND usage.plan_code = v_plan)
      );

    SELECT COALESCE(pg_catalog.sum(open_hold.hold_usd_micros), 0)
    INTO v_open
    FROM havkar_private.ai_spend_holds AS open_hold
    WHERE open_hold.expires_at > pg_catalog.clock_timestamp()
      AND open_hold.created_at >= v_window
      AND (
        v_limit.scope = 'global'
        OR (v_limit.scope = 'user' AND open_hold.user_id = p_user_id)
        OR (v_limit.scope = 'plan' AND open_hold.plan_code = v_plan)
      );

    IF v_spent + v_open >= v_limit.limit_usd_micros THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$ai_cost$;

REVOKE ALL ON FUNCTION public.ai_spend_limit_reached(uuid, bigint, bigint, bigint, bigint, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_spend_limit_reached(uuid, bigint, bigint, bigint, bigint, bigint, bigint)
  TO service_role;

NOTIFY pgrst, 'reload schema';
