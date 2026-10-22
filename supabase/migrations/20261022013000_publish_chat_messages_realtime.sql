-- Chat delivery listens for INSERT and UPDATE on public.messages,
-- filtered by conversation_id. Those events are not emitted while the
-- table is outside the supabase_realtime publication.
--
-- SELECT stays limited to the buyer or seller of the conversation.
-- Replica identity full lets the conversation filter match updates.
-- No message, conversation, or user row is inserted, updated, or deleted.
-- Apply this to staging first. Do not treat this file as a production
-- deployment by itself.

ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
