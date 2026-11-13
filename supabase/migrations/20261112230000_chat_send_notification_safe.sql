-- Keep message persistence even if in-app notification insert fails.
-- Does not invent delivery/read receipts. Does not touch payments.

CREATE OR REPLACE FUNCTION public.havkar_send_chat_message(
  p_conversation_id uuid,
  p_message_text text,
  p_client_message_id uuid DEFAULT NULL
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  conv public.conversations%ROWTYPE;
  existing public.messages%ROWTYPE;
  inserted public.messages%ROWTYPE;
  peer_id uuid;
  preview text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_message_text IS NULL OR length(trim(p_message_text)) = 0 THEN
    RAISE EXCEPTION 'empty_message' USING ERRCODE = '22023';
  END IF;

  -- UTF-8 byte-aware soft limit; emoji sequences may use multiple code units.
  IF char_length(p_message_text) > 4000 THEN
    RAISE EXCEPTION 'message_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO conv
  FROM public.conversations c
  WHERE c.id = p_conversation_id
    AND (c.buyer_id = uid OR c.seller_id = uid);

  IF conv.id IS NULL THEN
    RAISE EXCEPTION 'not_conversation_party' USING ERRCODE = '42501';
  END IF;

  IF p_client_message_id IS NOT NULL THEN
    SELECT * INTO existing
    FROM public.messages m
    WHERE m.sender_id = uid
      AND m.client_message_id = p_client_message_id;

    IF existing.id IS NOT NULL THEN
      RETURN existing;
    END IF;
  END IF;

  INSERT INTO public.messages (
    conversation_id,
    sender_id,
    message_text,
    is_read,
    client_message_id
  ) VALUES (
    p_conversation_id,
    uid,
    trim(p_message_text),
    false,
    p_client_message_id
  )
  RETURNING * INTO inserted;

  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = p_conversation_id;

  peer_id := CASE
    WHEN conv.buyer_id = uid THEN conv.seller_id
    ELSE conv.buyer_id
  END;

  preview := left(trim(p_message_text), 140);

  IF peer_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        is_read,
        action_url,
        reference_id,
        metadata
      ) VALUES (
        peer_id,
        'chat_message',
        'New HAVKAR message',
        preview,
        false,
        '/chat.html?conversation_id=' || p_conversation_id::text,
        inserted.id::text,
        jsonb_build_object(
          'conversation_id', p_conversation_id,
          'message_id', inserted.id,
          'sender_id', uid
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Message already persisted; do not roll back send on notification failure.
      RAISE WARNING 'havkar_send_chat_message notification skipped: %', SQLERRM;
    END;
  END IF;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.havkar_send_chat_message(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.havkar_send_chat_message(uuid, text, uuid) TO authenticated;
