-- HAVKAR AI Gemini cost protection.
-- Staging project keglioewbkgdabsizvys only.
-- Prices below are the published Gemini Developer API standard paid tier
-- (https://ai.google.dev/gemini-api/docs/pricing, verified 2026-10-18).
-- They are estimate ceilings, not Google invoices. The free tier is free of charge.
-- HAVKAR calls generateContent, streamGenerateContent, and the Interactions API,
-- not the Batch API. No spending limit is seeded: an absent limit does not
-- invent a budget. Count quotas in consume_ai_budget are unchanged.

CREATE TABLE IF NOT EXISTS havkar_private.ai_model_prices (
  model text PRIMARY KEY,
  tier text NOT NULL,
  input_usd_micros_per_million bigint NOT NULL,
  output_text_usd_micros_per_million bigint NOT NULL,
  output_image_usd_micros_per_million bigint,
  published_image_tokens integer,
  source_url text NOT NULL,
  verified_on date NOT NULL,
  CONSTRAINT ai_model_prices_tier CHECK (tier = 'standard'),
  CONSTRAINT ai_model_prices_rates CHECK (
    input_usd_micros_per_million > 0
    AND output_text_usd_micros_per_million > 0
    AND (output_image_usd_micros_per_million IS NULL OR output_image_usd_micros_per_million > 0)
    AND (published_image_tokens IS NULL OR published_image_tokens > 0)
  )
);

CREATE TABLE IF NOT EXISTS havkar_private.ai_spend_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL,
  user_id uuid,
  plan_code text,
  period text NOT NULL,
  limit_usd_micros bigint NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  CONSTRAINT ai_spend_limits_scope CHECK (
    (scope = 'global' AND user_id IS NULL AND plan_code IS NULL)
    OR (scope = 'user' AND user_id IS NOT NULL AND plan_code IS NULL)
    OR (scope = 'plan' AND user_id IS NULL AND plan_code IN ('free', 'plus', 'pro', 'business'))
  ),
  CONSTRAINT ai_spend_limits_period CHECK (period IN ('day', 'month')),
  CONSTRAINT ai_spend_limits_amount CHECK (limit_usd_micros >= 0 AND limit_usd_micros <= 1000000000000)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_spend_limits_global_idx
  ON havkar_private.ai_spend_limits (scope, period)
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS ai_spend_limits_user_idx
  ON havkar_private.ai_spend_limits (user_id, period)
  WHERE scope = 'user';

CREATE UNIQUE INDEX IF NOT EXISTS ai_spend_limits_plan_idx
  ON havkar_private.ai_spend_limits (plan_code, period)
  WHERE scope = 'plan';

CREATE TABLE IF NOT EXISTS havkar_private.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_code text NOT NULL,
  kind text NOT NULL,
  model text NOT NULL,
  provider_called boolean NOT NULL,
  http_status integer,
  prompt_tokens integer,
  output_text_tokens integer,
  thought_tokens integer,
  image_output_tokens integer,
  total_tokens integer,
  estimated_usd_micros bigint,
  price_tier text,
  usage_source text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT ai_usage_events_kind CHECK (kind IN ('text', 'image')),
  CONSTRAINT ai_usage_events_plan CHECK (plan_code IN ('free', 'plus', 'pro', 'business')),
  CONSTRAINT ai_usage_events_source CHECK (usage_source IN ('provider', 'missing')),
  CONSTRAINT ai_usage_events_tokens CHECK (
    (prompt_tokens IS NULL OR prompt_tokens >= 0)
    AND (output_text_tokens IS NULL OR output_text_tokens >= 0)
    AND (thought_tokens IS NULL OR thought_tokens >= 0)
    AND (image_output_tokens IS NULL OR image_output_tokens >= 0)
    AND (total_tokens IS NULL OR total_tokens >= 0)
    AND (estimated_usd_micros IS NULL OR estimated_usd_micros >= 0)
  )
);

CREATE INDEX IF NOT EXISTS ai_usage_events_window_idx
  ON havkar_private.ai_usage_events (created_at, user_id, plan_code);

CREATE TABLE IF NOT EXISTS havkar_private.ai_spend_holds (
  hold_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_code text NOT NULL,
  kind text NOT NULL,
  model text NOT NULL,
  hold_usd_micros bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT ai_spend_holds_amount CHECK (hold_usd_micros >= 0),
  CONSTRAINT ai_spend_holds_kind CHECK (kind IN ('text', 'image'))
);

CREATE TABLE IF NOT EXISTS havkar_private.ai_provider_leases (
  lease_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS havkar_private.ai_runtime_config (
  name text PRIMARY KEY,
  value integer NOT NULL,
  CONSTRAINT ai_runtime_config_value CHECK (value > 0 AND value < 1000000)
);

INSERT INTO havkar_private.ai_runtime_config (name, value)
VALUES ('simultaneous_provider_calls', 8)
ON CONFLICT (name) DO NOTHING;

INSERT INTO havkar_private.ai_model_prices (
  model,
  tier,
  input_usd_micros_per_million,
  output_text_usd_micros_per_million,
  output_image_usd_micros_per_million,
  published_image_tokens,
  source_url,
  verified_on
) VALUES
  (
    'gemini-3.5-flash-lite',
    'standard',
    300000,
    2500000,
    NULL,
    NULL,
    'https://ai.google.dev/gemini-api/docs/pricing',
    DATE '2026-10-18'
  ),
  (
    'gemini-3.1-flash-lite-image',
    'standard',
    250000,
    1500000,
    30000000,
    1120,
    'https://ai.google.dev/gemini-api/docs/pricing',
    DATE '2026-10-18'
  )
ON CONFLICT (model) DO UPDATE
SET tier = EXCLUDED.tier,
    input_usd_micros_per_million = EXCLUDED.input_usd_micros_per_million,
    output_text_usd_micros_per_million = EXCLUDED.output_text_usd_micros_per_million,
    output_image_usd_micros_per_million = EXCLUDED.output_image_usd_micros_per_million,
    published_image_tokens = EXCLUDED.published_image_tokens,
    source_url = EXCLUDED.source_url,
    verified_on = EXCLUDED.verified_on;

ALTER TABLE havkar_private.ai_model_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.ai_spend_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.ai_spend_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.ai_provider_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.ai_runtime_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE havkar_private.ai_model_prices FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE havkar_private.ai_spend_limits FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE havkar_private.ai_usage_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE havkar_private.ai_spend_holds FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE havkar_private.ai_provider_leases FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE havkar_private.ai_runtime_config FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.ai_active_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN subscription.status = 'active'
          AND subscription.plan_code IN ('plus', 'pro', 'business')
          AND (
            subscription.current_period_end IS NULL
            OR subscription.current_period_end > pg_catalog.now()
          )
        THEN subscription.plan_code
        ELSE 'free'
      END
      FROM public.ai_subscriptions AS subscription
      WHERE subscription.user_id = p_user_id
    ),
    'free'
  );
$ai_cost$;

REVOKE ALL ON FUNCTION havkar_private.ai_active_plan(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_provider_lease(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
DECLARE
  v_limit integer := 8;
  v_count integer;
  v_lease uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(87421018);

  SELECT config.value
  INTO v_limit
  FROM havkar_private.ai_runtime_config AS config
  WHERE config.name = 'simultaneous_provider_calls';

  IF v_limit IS NULL OR v_limit < 1 THEN
    v_limit := 8;
  END IF;

  DELETE FROM havkar_private.ai_provider_leases
  WHERE expires_at <= pg_catalog.clock_timestamp();

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM havkar_private.ai_provider_leases;

  IF v_count >= v_limit THEN
    RETURN NULL;
  END IF;

  v_lease := extensions.gen_random_uuid();
  INSERT INTO havkar_private.ai_provider_leases (lease_id, user_id, expires_at)
  VALUES (v_lease, p_user_id, pg_catalog.clock_timestamp() + interval '75 seconds');
  RETURN v_lease;
END;
$ai_cost$;

REVOKE ALL ON FUNCTION public.reserve_ai_provider_lease(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_provider_lease(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_ai_provider_lease(p_lease_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
BEGIN
  DELETE FROM havkar_private.ai_provider_leases
  WHERE lease_id = p_lease_id;
  RETURN TRUE;
END;
$ai_cost$;

REVOKE ALL ON FUNCTION public.release_ai_provider_lease(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ai_provider_lease(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_ai_spend_hold(p_hold_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ai_cost$
BEGIN
  DELETE FROM havkar_private.ai_spend_holds
  WHERE hold_id = p_hold_id;
  RETURN TRUE;
END;
$ai_cost$;

REVOKE ALL ON FUNCTION public.release_ai_spend_hold(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ai_spend_hold(uuid) TO service_role;

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
  p_global_month_micros bigint DEFAULT NULL
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
    (v_output_cap::numeric * v_text_rate + v_image_cap::numeric * COALESCE(v_image_rate, 0))
    / 1000000
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

REVOKE ALL ON FUNCTION public.reserve_ai_spend(uuid, text, text, integer, integer, bigint, bigint, bigint, bigint, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_spend(uuid, text, text, integer, integer, bigint, bigint, bigint, bigint, bigint, bigint)
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
  p_usage_source text
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
BEGIN
  IF p_user_id IS NULL OR p_kind NOT IN ('text', 'image') OR p_usage_source NOT IN ('provider', 'missing') THEN
    estimated_usd_micros := NULL;
    recorded := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(87421019);

  IF p_hold_id IS NOT NULL THEN
    DELETE FROM havkar_private.ai_spend_holds
    WHERE hold_id = p_hold_id
      AND user_id = p_user_id;
  END IF;

  IF p_provider_called IS NOT TRUE THEN
    estimated_usd_micros := NULL;
    recorded := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  v_plan := havkar_private.ai_active_plan(p_user_id);
  v_cost := NULL;

  IF p_usage_source = 'provider'
     AND p_prompt_tokens IS NOT NULL
     AND p_output_text_tokens IS NOT NULL
     AND p_image_output_tokens IS NOT NULL
     AND p_prompt_tokens BETWEEN 0 AND 10000000
     AND p_output_text_tokens BETWEEN 0 AND 10000000
     AND COALESCE(p_thought_tokens, 0) BETWEEN 0 AND 10000000
     AND p_image_output_tokens BETWEEN 0 AND 10000000
     AND (p_total_tokens IS NULL OR p_total_tokens BETWEEN 0 AND 20000000)
  THEN
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
    CASE WHEN v_cost IS NULL THEN NULL ELSE p_prompt_tokens END,
    CASE WHEN v_cost IS NULL THEN NULL ELSE p_output_text_tokens END,
    CASE WHEN v_cost IS NULL THEN NULL ELSE p_thought_tokens END,
    CASE WHEN v_cost IS NULL THEN NULL ELSE p_image_output_tokens END,
    CASE WHEN v_cost IS NULL THEN NULL ELSE p_total_tokens END,
    v_cost,
    CASE WHEN v_cost IS NULL THEN NULL ELSE 'standard' END,
    CASE WHEN v_cost IS NULL THEN 'missing' ELSE 'provider' END
  );

  estimated_usd_micros := v_cost;
  recorded := TRUE;
  RETURN NEXT;
END;
$ai_cost$;

REVOKE ALL ON FUNCTION public.record_ai_provider_usage(uuid, uuid, text, text, boolean, integer, integer, integer, integer, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_provider_usage(uuid, uuid, text, text, boolean, integer, integer, integer, integer, integer, integer, text)
  TO service_role;
