-- Genuine per-message delivery and read receipts.
--
-- A receipt row is created only by the authenticated recipient after that
-- client has received the message. The server overwrites every timestamp.
-- Existing messages, is_read values, and messages RLS policies are unchanged.
-- Do not apply this file to production until that deployment is explicitly approved.

CREATE TABLE public.message_receipts (
  message_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL,
  read_at timestamptz,
  CONSTRAINT message_receipts_pkey PRIMARY KEY (message_id, recipient_id),
  CONSTRAINT message_receipts_message_id_fkey
    FOREIGN KEY (message_id) REFERENCES public.messages (id) ON DELETE CASCADE,
  CONSTRAINT message_receipts_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations (id) ON DELETE CASCADE,
  CONSTRAINT message_receipts_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE INDEX message_receipts_conversation_id_idx
  ON public.message_receipts (conversation_id);

ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.message_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.message_receipts FROM anon;
REVOKE ALL ON TABLE public.message_receipts FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.message_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_message_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_sender uuid;
  v_conversation uuid;
  v_buyer uuid;
  v_seller uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'receipt requires an authenticated user'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'receipt deletion is not allowed'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT
      m.sender_id,
      m.conversation_id,
      c.buyer_id,
      c.seller_id
    INTO
      v_sender,
      v_conversation,
      v_buyer,
      v_seller
    FROM public.messages AS m
    JOIN public.conversations AS c
      ON c.id = m.conversation_id
    WHERE m.id = NEW.message_id;

    IF v_conversation IS NULL THEN
      RAISE EXCEPTION 'receipt message is not available'
        USING ERRCODE = '42501';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer
      AND auth.uid() IS DISTINCT FROM v_seller THEN
      RAISE EXCEPTION 'receipt requires conversation membership'
        USING ERRCODE = '42501';
    END IF;

    IF auth.uid() = v_sender THEN
      RAISE EXCEPTION 'sender cannot create a delivery receipt'
        USING ERRCODE = '42501';
    END IF;

    NEW.recipient_id := auth.uid();
    NEW.conversation_id := v_conversation;
    NEW.delivered_at := now();
    NEW.read_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.message_id IS DISTINCT FROM OLD.message_id
    OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
    RAISE EXCEPTION 'receipt identity and delivery time are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.recipient_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only the recipient can update a receipt'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.read_at IS NOT NULL THEN
    NEW.read_at := OLD.read_at;
    RETURN NEW;
  END IF;

  IF NEW.read_at IS NOT NULL THEN
    NEW.read_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_message_receipt() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_message_receipt() TO authenticated;

DROP TRIGGER IF EXISTS message_receipts_enforce
  ON public.message_receipts;

CREATE TRIGGER message_receipts_enforce
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.message_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_receipt();

CREATE POLICY "Recipients acknowledge their own messages"
  ON public.message_receipts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    recipient_id = auth.uid()
    AND read_at IS NULL
    AND delivered_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.messages AS m
      JOIN public.conversations AS c
        ON c.id = m.conversation_id
      WHERE m.id = message_receipts.message_id
        AND m.conversation_id = message_receipts.conversation_id
        AND m.sender_id <> auth.uid()
        AND (
          auth.uid() = c.buyer_id
          OR auth.uid() = c.seller_id
        )
    )
  );

CREATE POLICY "Recipients record a read receipt"
  ON public.message_receipts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (
    recipient_id = auth.uid()
    AND delivered_at IS NOT NULL
  );

CREATE POLICY "Participants can view message receipts"
  ON public.message_receipts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations AS c
      WHERE c.id = message_receipts.conversation_id
        AND (
          auth.uid() = c.buyer_id
          OR auth.uid() = c.seller_id
        )
    )
  );

ALTER TABLE public.message_receipts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.message_receipts;
  END IF;
END $$;
