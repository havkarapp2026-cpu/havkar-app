-- One-time Testnet wallet ownership challenges.
-- Rows are written only after this migration is applied to staging.
-- No secret is stored. Production is not modified by applying this file here.
-- A consumed row exists only after server-side signature verification.

CREATE TABLE IF NOT EXISTS public.wallet_ownership_challenges (
  nonce text PRIMARY KEY,
  pubkey text NOT NULL,
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_ownership_challenges_nonce_chk
    CHECK (nonce ~ '^[0-9a-f]{32}$'),
  CONSTRAINT wallet_ownership_challenges_pubkey_chk
    CHECK (pubkey = 'GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L'),
  CONSTRAINT wallet_ownership_challenges_message_chk
    CHECK (
      message LIKE 'HAVKAR wallet ownership%'
      AND position('network=testnet' in message) > 0
      AND position('funds=none' in message) > 0
    ),
  CONSTRAINT wallet_ownership_challenges_state_chk
    CHECK (state IN ('pending', 'consumed', 'superseded')),
  CONSTRAINT wallet_ownership_challenges_used_chk
    CHECK (
      (state = 'consumed' AND used_at IS NOT NULL)
      OR (state <> 'consumed' AND used_at IS NULL)
    )
);

ALTER TABLE public.wallet_ownership_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ownership_challenges FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wallet_ownership_challenges
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.wallet_ownership_challenges
  TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'wallet_ownership_challenges'
      AND policyname = 'wallet_ownership_challenges_no_client'
  ) THEN
    CREATE POLICY wallet_ownership_challenges_no_client
      ON public.wallet_ownership_challenges
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

COMMENT ON TABLE public.wallet_ownership_challenges IS
  'Staging-only Albedo Testnet ownership challenges. No secret and no payment.';
