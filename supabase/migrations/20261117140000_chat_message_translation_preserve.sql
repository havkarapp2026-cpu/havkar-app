-- Preserve original chat message text when a translation is also stored.
-- message_text always remains the original. translated_text is optional/derived.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS translated_text text,
  ADD COLUMN IF NOT EXISTS translation_target_lang text,
  ADD COLUMN IF NOT EXISTS translation_source_lang text;

COMMENT ON COLUMN public.messages.translated_text IS
  'Optional derived translation. Never replaces message_text (original).';
COMMENT ON COLUMN public.messages.translation_target_lang IS
  'BCP-47 / HAVKAR language code for translated_text when present.';
COMMENT ON COLUMN public.messages.translation_source_lang IS
  'Optional detected or declared source language for the original message_text.';

DROP FUNCTION IF EXISTS public.havkar_send_chat_message(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.havkar_send_chat_message(
  p_conversation_id uuid,
  p_message_text text,
  p_client_message_id uuid DEFAULT NULL,
  p_translated_text text DEFAULT NULL,
  p_translation_target_lang text DEFAULT NULL,
  p_translation_source_lang text DEFAULT NULL
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
  original_text text := trim(coalesce(p_message_text, ''));
  translated text := nullif(trim(coalesce(p_translated_text, '')), '');
  target_lang text := nullif(trim(coalesce(p_translation_target_lang, '')), '');
  source_lang text := nullif(trim(coalesce(p_translation_source_lang, '')), '');
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF original_text IS NULL OR length(original_text) = 0 THEN
    RAISE EXCEPTION 'empty_message' USING ERRCODE = '22023';
  END IF;

  IF char_length(original_text) > 4000 THEN
    RAISE EXCEPTION 'message_too_long' USING ERRCODE = '22023';
  END IF;

  IF translated IS NOT NULL AND char_length(translated) > 4000 THEN
    RAISE EXCEPTION 'translated_message_too_long' USING ERRCODE = '22023';
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
    translated_text,
    translation_target_lang,
    translation_source_lang,
    is_read,
    client_message_id
  ) VALUES (
    p_conversation_id,
    uid,
    original_text,
    translated,
    CASE WHEN translated IS NULL THEN NULL ELSE target_lang END,
    CASE WHEN translated IS NULL THEN NULL ELSE source_lang END,
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

  preview := left(original_text, 140);

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
          'sender_id', uid,
          'has_translation', translated IS NOT NULL
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'havkar_send_chat_message notification skipped: %', SQLERRM;
    END;
  END IF;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.havkar_send_chat_message(uuid, text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.havkar_send_chat_message(uuid, text, uuid, text, text, text) TO authenticated;
