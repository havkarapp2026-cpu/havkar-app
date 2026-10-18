-- Staging hardening for HAVKAR AI table privileges.
-- Removes direct maintenance privileges from client roles.
-- Does not change service_role, private quota tables, or existing triggers.

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.ai_conversations,
  public.ai_messages,
  public.ai_subscriptions,
  public.ai_generated_files,
  public.ai_file_reviews
FROM authenticated, anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.ai_message_touch() FROM authenticated, anon, PUBLIC;
