-- Platform security hardening (additive, non-destructive).
-- 1) Fix mutable search_path on havkar_is_reaction_emoji.
-- 2) Revoke anon EXECUTE on SECURITY DEFINER RPCs that require auth.uid().
-- Does not enable payments. Does not weaken existing RLS.

CREATE OR REPLACE FUNCTION public.havkar_is_reaction_emoji(p_emoji text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
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

REVOKE ALL ON FUNCTION public.havkar_is_reaction_emoji(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.havkar_is_reaction_emoji(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.havkar_is_reaction_emoji(text) IS
  'Unicode reaction emoji validator with fixed search_path. Authenticated-only EXECUTE.';

DO $$
BEGIN
  IF to_regprocedure('public.havkar_get_or_create_listing_conversation(bigint)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.havkar_get_or_create_listing_conversation(bigint)
      FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.havkar_get_or_create_listing_conversation(bigint)
      TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.event_interest_counts()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.event_interest_counts() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.event_interest_counts() TO authenticated, service_role;
  END IF;
END $$;
