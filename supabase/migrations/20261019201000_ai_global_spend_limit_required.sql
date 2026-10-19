-- HAVKAR AI global spend limit.
-- Step 11. Does not edit the ten approved migration files.
-- A missing global day limit or a missing global month limit denies the
-- reservation. An absent row no longer means unlimited spend.
-- Inserts USD 1 per day (1000000 micros) and USD 10 per month (10000000
-- micros) only when that global row is absent. An existing different amount
-- fails this migration instead of being overwritten.

CREATE OR REPLACE FUNCTION public.ai_spend_limit_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
  SELECT
    EXISTS (
      SELECT 1
      FROM havkar_private.ai_spend_limits AS limits
      WHERE limits.enabled = TRUE
        AND limits.scope = 'global'
        AND limits.period = 'day'
        AND limits.user_id IS NULL
        AND limits.plan_code IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM havkar_private.ai_spend_limits AS limits
      WHERE limits.enabled = TRUE
        AND limits.scope = 'global'
        AND limits.period = 'month'
        AND limits.user_id IS NULL
        AND limits.plan_code IS NULL
    );
$ai_cost$;

REVOKE ALL ON FUNCTION public.ai_spend_limit_active() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_spend_limit_active() TO service_role;

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
  v_global_day boolean := FALSE;
  v_global_month boolean := FALSE;
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
    IF v_limit.scope = 'global' AND v_limit.period = 'day' THEN
      v_global_day := TRUE;
    END IF;
    IF v_limit.scope = 'global' AND v_limit.period = 'month' THEN
      v_global_month := TRUE;
    END IF;

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

  IF v_global_day IS NOT TRUE OR v_global_month IS NOT TRUE THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$ai_cost$;

REVOKE ALL ON FUNCTION public.ai_spend_limit_reached(uuid, bigint, bigint, bigint, bigint, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_spend_limit_reached(uuid, bigint, bigint, bigint, bigint, bigint, bigint)
  TO service_role;

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
  v_unitemized_cap integer := 0;
  v_input_tokens integer;
  v_hold bigint := 0;
  v_limit record;
  v_window timestamp with time zone;
  v_spent bigint;
  v_open bigint;
  v_unpriced boolean;
  v_global_day boolean := FALSE;
  v_global_month boolean := FALSE;
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
    IF v_limit.scope = 'global' AND v_limit.period = 'day' THEN
      v_global_day := TRUE;
    END IF;
    IF v_limit.scope = 'global' AND v_limit.period = 'month' THEN
      v_global_month := TRUE;
    END IF;
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

  IF v_global_day IS NOT TRUE OR v_global_month IS NOT TRUE THEN
    allowed := FALSE;
    hold_id := NULL;
    reason := 'unconfigured';
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
    v_unitemized_cap := COALESCE(v_published_image, 0);
    IF v_image_rate IS NULL OR v_image_cap < 1 OR v_unitemized_cap < 1 THEN
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
      + (v_image_cap + v_unitemized_cap)::numeric * COALESCE(v_image_rate, 0)
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

INSERT INTO havkar_private.ai_spend_limits (scope, period, limit_usd_micros, enabled)
SELECT 'global', 'day', 1000000, TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM havkar_private.ai_spend_limits AS limits
  WHERE limits.scope = 'global'
    AND limits.period = 'day'
    AND limits.user_id IS NULL
    AND limits.plan_code IS NULL
);

INSERT INTO havkar_private.ai_spend_limits (scope, period, limit_usd_micros, enabled)
SELECT 'global', 'month', 10000000, TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM havkar_private.ai_spend_limits AS limits
  WHERE limits.scope = 'global'
    AND limits.period = 'month'
    AND limits.user_id IS NULL
    AND limits.plan_code IS NULL
);

DO $ai_spend_guard$
BEGIN
  IF (
    SELECT count(*)
    FROM havkar_private.ai_spend_limits AS limits
    WHERE limits.enabled = TRUE
      AND limits.scope = 'global'
      AND limits.user_id IS NULL
      AND limits.plan_code IS NULL
      AND (
        (limits.period = 'day' AND limits.limit_usd_micros = 1000000)
        OR (limits.period = 'month' AND limits.limit_usd_micros = 10000000)
      )
  ) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'global spend limits must be 1000000 micros per day and 10000000 micros per month';
  END IF;
END
$ai_spend_guard$;

NOTIFY pgrst, 'reload schema';
