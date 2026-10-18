-- Remove the remaining client MAINTAIN privilege from HAVKAR AI tables.
-- Does not change service_role or private quota tables.

REVOKE MAINTAIN ON TABLE
  public.ai_conversations,
  public.ai_messages,
  public.ai_subscriptions,
  public.ai_generated_files,
  public.ai_file_reviews
FROM authenticated, anon, PUBLIC;
