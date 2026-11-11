-- Account-level user blocks + revoke unintended anon RPC.
-- Does not enable payments. Apply only with Owner approval on Production.

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text,
  CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_id_idx
  ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own
  ON public.user_blocks
  FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
CREATE POLICY user_blocks_insert_own
  ON public.user_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid() AND blocked_id <> auth.uid());

DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_delete_own
  ON public.user_blocks
  FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

REVOKE ALL ON TABLE public.user_blocks FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_blocks TO authenticated;
GRANT ALL ON TABLE public.user_blocks TO service_role;

COMMENT ON TABLE public.user_blocks IS
  'Account-level blocks. Blocker can manage their own rows only. No secrets.';

-- Public event interest counts should not be callable by anonymous clients
-- as SECURITY DEFINER unless intentionally productized.
DO $$
BEGIN
  IF to_regprocedure('public.event_interest_counts()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.event_interest_counts() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.event_interest_counts() TO authenticated, service_role;
  END IF;
END $$;
