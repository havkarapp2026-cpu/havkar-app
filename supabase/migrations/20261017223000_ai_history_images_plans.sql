-- HAVKAR AI history, private generated images, and unactivated plans.
-- Staging only. This does not change wallet, payment, or production data.

CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Conversation',
  language text NOT NULL DEFAULT 'en',
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  deleted_at timestamp with time zone,
  CONSTRAINT ai_conversations_title_length CHECK (char_length(title) BETWEEN 1 AND 80),
  CONSTRAINT ai_conversations_language_length CHECK (char_length(language) BETWEEN 2 AND 8)
);

CREATE INDEX ai_conversations_owner_updated_idx
  ON public.ai_conversations (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'complete',
  task text NOT NULL DEFAULT 'general',
  attachment_path text,
  image_path text,
  client_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT ai_messages_client_unique UNIQUE (conversation_id, client_id),
  CONSTRAINT ai_messages_role CHECK (role IN ('user', 'assistant')),
  CONSTRAINT ai_messages_status CHECK (status IN ('complete', 'interrupted', 'error')),
  CONSTRAINT ai_messages_content_length CHECK (char_length(content) BETWEEN 1 AND 12000),
  CONSTRAINT ai_messages_task_length CHECK (char_length(task) BETWEEN 1 AND 40)
);

CREATE INDEX ai_messages_conversation_created_idx
  ON public.ai_messages (conversation_id, created_at);

CREATE TABLE public.ai_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_code text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT ai_subscriptions_plan CHECK (plan_code IN ('free', 'plus', 'pro')),
  CONSTRAINT ai_subscriptions_status CHECK (status IN ('free', 'incomplete', 'active', 'past_due', 'canceled', 'unpaid'))
);

CREATE TABLE public.ai_generated_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  path text NOT NULL UNIQUE,
  mime text NOT NULL,
  aspect text NOT NULL,
  model text NOT NULL,
  byte_count integer NOT NULL,
  transparent boolean NOT NULL DEFAULT false,
  scan_status text NOT NULL DEFAULT 'unscanned',
  list_price_usd_micros integer,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (pg_catalog.now() + interval '30 days'),
  CONSTRAINT ai_generated_files_scan CHECK (scan_status = 'unscanned'),
  CONSTRAINT ai_generated_files_bytes CHECK (byte_count > 0 AND byte_count <= 8000000),
  CONSTRAINT ai_generated_files_path CHECK (
    path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$'
  )
);

CREATE TABLE public.ai_file_reviews (
  path text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  bucket_id text NOT NULL,
  scan_status text NOT NULL DEFAULT 'unscanned',
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (pg_catalog.now() + interval '30 days'),
  CONSTRAINT ai_file_reviews_scan CHECK (scan_status = 'unscanned'),
  CONSTRAINT ai_file_reviews_bucket CHECK (bucket_id IN ('ai-attachments', 'ai-generated'))
);

CREATE TABLE havkar_private.ai_image_usage (
  bucket_key text PRIMARY KEY,
  window_start timestamp with time zone NOT NULL,
  images integer NOT NULL,
  CONSTRAINT ai_image_usage_images_nonnegative CHECK (images >= 0)
);

CREATE TABLE havkar_private.ai_billing_events (
  event_id text PRIMARY KEY,
  received_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT ai_billing_events_id_length CHECK (char_length(event_id) BETWEEN 1 AND 120)
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_file_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.ai_image_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.ai_billing_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE havkar_private.ai_image_usage FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE havkar_private.ai_billing_events FROM PUBLIC, anon, authenticated, service_role;

CREATE POLICY ai_conversations_own ON public.ai_conversations
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY ai_messages_select_own ON public.ai_messages
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY ai_messages_insert_own ON public.ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.ai_conversations AS conversation
      WHERE conversation.id = conversation_id
        AND conversation.user_id = (SELECT auth.uid())
        AND conversation.deleted_at IS NULL
    )
    AND (
      attachment_path IS NULL
      OR lower(split_part(attachment_path, '/', 1)) = lower((SELECT auth.uid())::text)
    )
    AND (
      image_path IS NULL
      OR lower(split_part(image_path, '/', 1)) = lower((SELECT auth.uid())::text)
    )
  );

CREATE POLICY ai_subscriptions_select_own ON public.ai_subscriptions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY ai_generated_files_select_own ON public.ai_generated_files
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY ai_file_reviews_own ON public.ai_file_reviews
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND scan_status = 'unscanned'
    AND bucket_id = 'ai-attachments'
    AND lower(split_part(path, '/', 1)) = lower((SELECT auth.uid())::text)
  );

CREATE OR REPLACE FUNCTION public.ai_message_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.ai_conversations
  SET updated_at = pg_catalog.now()
  WHERE id = NEW.conversation_id
    AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_messages_touch ON public.ai_messages;
CREATE TRIGGER ai_messages_touch
  AFTER INSERT ON public.ai_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_message_touch();

REVOKE ALL ON FUNCTION public.ai_message_touch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_message_touch() TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'ai-generated', 'ai-generated', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'ai-generated');

DROP POLICY IF EXISTS ai_generated_select_own ON storage.objects;
CREATE POLICY ai_generated_select_own
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ai-generated'
    AND (SELECT auth.uid()) IS NOT NULL
    AND cardinality(storage.foldername(name)) = 1
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  );

DROP POLICY IF EXISTS ai_generated_delete_own ON storage.objects;
CREATE POLICY ai_generated_delete_own
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ai-generated'
    AND (SELECT auth.uid()) IS NOT NULL
    AND cardinality(storage.foldername(name)) = 1
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  );

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
  v_plan text := 'free';
  v_status text := 'free';
  v_period timestamp with time zone;
  v_hour_requests integer := 12;
  v_day_requests integer := 30;
  v_hour_characters integer := 6000;
  v_day_characters integer := 15000;
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
      v_hour_requests := 30;
      v_day_requests := 90;
      v_hour_characters := 18000;
      v_day_characters := 45000;
    ELSIF v_plan = 'pro' THEN
      v_hour_requests := 60;
      v_day_requests := 200;
      v_hour_characters := 36000;
      v_day_characters := 80000;
    END IF;
  END IF;

  v_epoch := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint;
  v_hour := v_epoch / 3600;
  v_day := v_epoch / 86400;
  v_hour_start := pg_catalog.to_timestamp(v_hour * 3600);
  v_day_start := pg_catalog.to_timestamp(v_day * 86400);
  v_hour_retry := ((v_hour + 1) * 3600 - v_epoch)::integer;
  v_day_retry := ((v_day + 1) * 86400 - v_epoch)::integer;
  IF v_hour_retry < 1 THEN v_hour_retry := 1; END IF;
  IF v_day_retry < 1 THEN v_day_retry := 1; END IF;

  DELETE FROM havkar_private.ai_usage_buckets
  WHERE window_start < v_day_start - interval '2 days';

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
$$;

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
AS $$
DECLARE
  v_epoch bigint;
  v_day bigint;
  v_day_start timestamp with time zone;
  v_month text;
  v_month_start timestamp with time zone;
  v_retry integer;
  v_ok boolean;
  v_plan text := 'free';
  v_status text := 'free';
  v_period timestamp with time zone;
  v_limit integer := 4;
BEGIN
  IF p_user_id IS NULL OR p_images IS NULL OR p_images <> 1 THEN
    RAISE EXCEPTION 'invalid assistant image budget request' USING ERRCODE = '22023';
  END IF;

  SELECT subscription.plan_code, subscription.status, subscription.current_period_end
  INTO v_plan, v_status, v_period
  FROM public.ai_subscriptions AS subscription
  WHERE subscription.user_id = p_user_id;

  IF v_status = 'active' AND (v_period IS NULL OR v_period > pg_catalog.now()) THEN
    IF v_plan = 'plus' THEN v_limit := 30;
    ELSIF v_plan = 'pro' THEN v_limit := 80;
    END IF;
  END IF;

  v_epoch := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint;
  v_day := v_epoch / 86400;
  v_day_start := pg_catalog.to_timestamp(v_day * 86400);
  v_month := pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_month_start := (pg_catalog.date_trunc('month', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  v_retry := ((v_day + 1) * 86400 - v_epoch)::integer;
  IF v_retry < 1 THEN v_retry := 1; END IF;

  BEGIN
    v_ok := NULL;
    INSERT INTO havkar_private.ai_image_usage AS usage (bucket_key, window_start, images)
    VALUES ('g:d:' || v_day::text, v_day_start, 1)
    ON CONFLICT (bucket_key) DO UPDATE
    SET images = usage.images + 1
    WHERE usage.images + 1 <= 40
    RETURNING TRUE INTO v_ok;
    IF v_ok IS NOT TRUE THEN
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
$$;

REVOKE ALL ON FUNCTION public.consume_ai_image_budget(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_image_budget(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_ai_image_budget(
  p_user_id uuid,
  p_images integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_epoch bigint;
  v_day bigint;
  v_month text;
BEGIN
  IF p_user_id IS NULL OR p_images IS DISTINCT FROM 1 THEN
    RETURN FALSE;
  END IF;

  v_epoch := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint;
  v_day := v_epoch / 86400;
  v_month := pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM');

  UPDATE havkar_private.ai_image_usage
  SET images = images - 1
  WHERE bucket_key IN (
      'g:d:' || v_day::text,
      'u:m:' || p_user_id::text || ':' || v_month
    )
    AND images > 0;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_ai_image_budget(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ai_image_budget(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.list_expired_ai_files(p_user_id uuid)
RETURNS TABLE (bucket_id text, path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'ai-generated'::text, generated.path
  FROM public.ai_generated_files AS generated
  WHERE generated.user_id = p_user_id
    AND generated.expires_at < pg_catalog.now()
  UNION ALL
  SELECT review.bucket_id, review.path
  FROM public.ai_file_reviews AS review
  WHERE review.user_id = p_user_id
    AND review.expires_at < pg_catalog.now();
$$;

CREATE OR REPLACE FUNCTION public.delete_expired_ai_file_rows(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  DELETE FROM public.ai_generated_files
  WHERE user_id = p_user_id AND expires_at < pg_catalog.now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM public.ai_file_reviews
  WHERE user_id = p_user_id AND expires_at < pg_catalog.now();
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.list_expired_ai_files(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_expired_ai_file_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_expired_ai_files(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_expired_ai_file_rows(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_ai_billing_event(p_event_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_event_id IS NULL OR char_length(p_event_id) < 1 OR char_length(p_event_id) > 120 THEN
    RETURN FALSE;
  END IF;
  INSERT INTO havkar_private.ai_billing_events (event_id) VALUES (p_event_id);
  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_billing_event(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_billing_event(text) TO service_role;

REVOKE ALL ON TABLE public.ai_conversations FROM anon;
REVOKE ALL ON TABLE public.ai_messages FROM anon;
REVOKE ALL ON TABLE public.ai_subscriptions FROM anon;
REVOKE ALL ON TABLE public.ai_generated_files FROM anon;
REVOKE ALL ON TABLE public.ai_file_reviews FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT ON public.ai_messages TO authenticated;
GRANT SELECT ON public.ai_subscriptions TO authenticated;
GRANT SELECT ON public.ai_generated_files TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.ai_file_reviews TO authenticated;

GRANT ALL ON TABLE public.ai_conversations TO service_role;
GRANT ALL ON TABLE public.ai_messages TO service_role;
GRANT ALL ON TABLE public.ai_subscriptions TO service_role;
GRANT ALL ON TABLE public.ai_generated_files TO service_role;
GRANT ALL ON TABLE public.ai_file_reviews TO service_role;
