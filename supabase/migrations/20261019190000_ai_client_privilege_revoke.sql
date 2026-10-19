-- HAVKAR AI client privilege revoke.
-- Step 10 of the approved production sequence.
-- Removes client write privileges that default privileges re-add
-- after the AI tables are created. Does not change rows, policies,
-- service_role, or private quota tables.

REVOKE UPDATE, DELETE ON TABLE public.ai_messages
FROM authenticated, anon, PUBLIC;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_subscriptions
FROM authenticated, anon, PUBLIC;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_generated_files
FROM authenticated, anon, PUBLIC;
