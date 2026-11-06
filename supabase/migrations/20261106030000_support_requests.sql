-- Public support requests are written only by the server.
-- Anonymous and signed-in clients cannot read or insert this table directly.
-- This file does not delete accounts or change production payments.

CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  topic text NOT NULL,
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  message text NOT NULL,
  language_code text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT support_requests_reference_check
    CHECK (reference ~ '^[A-Z2-9]{10}$'),
  CONSTRAINT support_requests_topic_check
    CHECK (topic IN (
      'account_recovery',
      'login_registration',
      'technical',
      'payment',
      'marketplace_dispute',
      'privacy',
      'account_deletion',
      'other'
    )),
  CONSTRAINT support_requests_name_check
    CHECK (char_length(requester_name) BETWEEN 2 AND 80),
  CONSTRAINT support_requests_email_check
    CHECK (char_length(requester_email) BETWEEN 6 AND 180),
  CONSTRAINT support_requests_message_check
    CHECK (char_length(message) BETWEEN 20 AND 4000),
  CONSTRAINT support_requests_language_check
    CHECK (language_code IN ('en', 'fa', 'it', 'sv', 'ckb', 'kmr', 'ar')),
  CONSTRAINT support_requests_status_check
    CHECK (status IN ('received', 'in_review', 'closed'))
);

CREATE INDEX support_requests_email_created_idx
  ON public.support_requests (requester_email, created_at DESC);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.support_requests TO service_role;

CREATE TABLE public.support_rate_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  requests integer NOT NULL,
  CONSTRAINT support_rate_buckets_key_check
    CHECK (char_length(bucket_key) BETWEEN 8 AND 80),
  CONSTRAINT support_rate_buckets_requests_check
    CHECK (requests >= 0)
);

ALTER TABLE public.support_rate_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_rate_buckets
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_support_budget(
  p_email text,
  p_client_ip text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_email_key text;
  v_ip_key text;
  v_email_count integer;
  v_ip_count integer;
BEGIN
  IF p_email IS NULL
     OR p_client_ip IS NULL
     OR char_length(p_email) < 6
     OR char_length(p_email) > 180
     OR p_client_ip !~ '^[0-9A-Fa-f:.]{3,45}$'
  THEN
    RETURN false;
  END IF;

  v_email_key := 'e:' || pg_catalog.md5(pg_catalog.lower(p_email));
  v_ip_key := 'i:' || pg_catalog.md5(p_client_ip);

  INSERT INTO public.support_rate_buckets (bucket_key, window_start, requests)
  VALUES (v_email_key, v_window, 1)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    requests = CASE
      WHEN public.support_rate_buckets.window_start = EXCLUDED.window_start
      THEN public.support_rate_buckets.requests + 1
      ELSE 1
    END,
    window_start = EXCLUDED.window_start
  RETURNING requests INTO v_email_count;

  INSERT INTO public.support_rate_buckets (bucket_key, window_start, requests)
  VALUES (v_ip_key, v_window, 1)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    requests = CASE
      WHEN public.support_rate_buckets.window_start = EXCLUDED.window_start
      THEN public.support_rate_buckets.requests + 1
      ELSE 1
    END,
    window_start = EXCLUDED.window_start
  RETURNING requests INTO v_ip_count;

  RETURN v_email_count <= 5 AND v_ip_count <= 12;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_support_budget(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_support_budget(text, text) TO service_role;
