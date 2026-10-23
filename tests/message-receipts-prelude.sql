-- Disposable fixture for message receipt prechecks.
-- This is not a production migration and it is not applied to HAVKAR Supabase.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY
);

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY,
  ad_id bigint,
  buyer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  message_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;

CREATE POLICY "Users can view their conversations"
  ON public.conversations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = buyer_id) OR (auth.uid() = seller_id));

CREATE POLICY "Users can send messages"
  ON public.messages
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = sender_id)
    AND EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          auth.uid() = c.buyer_id
          OR auth.uid() = c.seller_id
        )
    )
  );

CREATE POLICY "Users can update messages"
  ON public.messages
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = sender_id)
    AND EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          auth.uid() = c.buyer_id
          OR auth.uid() = c.seller_id
        )
    )
  )
  WITH CHECK (
    (auth.uid() = sender_id)
    AND EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          auth.uid() = c.buyer_id
          OR auth.uid() = c.seller_id
        )
    )
  );

CREATE POLICY "Users can view conversation messages"
  ON public.messages
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          auth.uid() = c.buyer_id
          OR auth.uid() = c.seller_id
        )
    )
  );

CREATE PUBLICATION supabase_realtime;

INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

INSERT INTO public.conversations (
  id, buyer_id, seller_id
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO public.messages (
  id, conversation_id, sender_id, message_text, is_read
) VALUES
  (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'historical',
    true
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'live',
    false
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'already flagged',
    true
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'sender attempt',
    true
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'stranger attempt',
    true
  );

CREATE TABLE public.receipt_test_snapshot (
  id integer PRIMARY KEY,
  messages_policies text NOT NULL,
  message_count integer NOT NULL,
  historical_flags text NOT NULL
);

INSERT INTO public.receipt_test_snapshot
SELECT
  1,
  (
    SELECT string_agg(
      pol.polname || '|' || pol.polcmd::text || '|' ||
      COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || '|' ||
      COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
      E'\n'
      ORDER BY pol.polname
    )
    FROM pg_policy pol
    WHERE pol.polrelid = 'public.messages'::regclass
  ),
  (SELECT count(*) FROM public.messages),
  (
    SELECT string_agg(
      id::text || ':' || message_text || ':' || is_read::text,
      E'\n'
      ORDER BY id
    )
    FROM public.messages
  );
