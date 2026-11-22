-- ROOT CAUSE:
-- message_reactions INSERT/UPDATE RLS only allowed
--   ❤️ 😂 😍 👍 😢 😡
-- while chat.html quick reactions + full Unicode picker also send
--   🙏 🔥 👏 🎉 and any catalog emoji → policy violation →
--   "Reaction could not be saved."
--
-- Keep conversation membership + own-user checks (do not weaken RLS).
-- Replace the obsolete 6-emoji allow-list with a bounded emoji validator.

CREATE OR REPLACE FUNCTION public.havkar_is_reaction_emoji(p_emoji text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_emoji IS NOT NULL
    AND btrim(p_emoji) <> ''
    AND char_length(p_emoji) BETWEEN 1 AND 32
    AND octet_length(p_emoji) <= 64
    AND p_emoji !~ '[[:cntrl:]]'
    AND p_emoji !~ '[[:space:]]'
    AND p_emoji !~ '[<>&"''`\\]';
$$;

REVOKE ALL ON FUNCTION public.havkar_is_reaction_emoji(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.havkar_is_reaction_emoji(text) TO authenticated;

DROP POLICY IF EXISTS "Users can add reactions in their conversations"
  ON public.message_reactions;

CREATE POLICY "Users can add reactions in their conversations"
  ON public.message_reactions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.havkar_is_reaction_emoji(emoji)
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND (auth.uid() = c.buyer_id OR auth.uid() = c.seller_id)
    )
  );

DROP POLICY IF EXISTS "Users can update their own reactions"
  ON public.message_reactions;

CREATE POLICY "Users can update their own reactions"
  ON public.message_reactions
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND public.havkar_is_reaction_emoji(emoji)
  );

COMMENT ON FUNCTION public.havkar_is_reaction_emoji(text) IS
  'Allows Unicode reaction emoji (including ZWJ/skin-tone/flag sequences) while rejecting empty/control/markup payloads. Conversation membership remains enforced by RLS.';
