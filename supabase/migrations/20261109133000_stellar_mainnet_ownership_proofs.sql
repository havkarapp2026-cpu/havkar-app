-- Durable Mainnet destination ownership proofs for HAVKAR Production.
-- Stores only public verification metadata. No seeds or private keys.
-- Challenge issuance itself is HMAC-stateless; this table records successful proofs.

CREATE TABLE IF NOT EXISTS public.stellar_mainnet_ownership_proofs (
  nonce text PRIMARY KEY,
  pubkey text NOT NULL,
  message text NOT NULL,
  method text NOT NULL,
  verified_at timestamptz NOT NULL,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stellar_mainnet_ownership_proofs_nonce_chk
    CHECK (nonce ~ '^[0-9a-f]{32}$'),
  CONSTRAINT stellar_mainnet_ownership_proofs_pubkey_chk
    CHECK (pubkey ~ '^G[A-Z2-7]{55}$'),
  CONSTRAINT stellar_mainnet_ownership_proofs_message_chk
    CHECK (
      message LIKE 'HAVKAR Mainnet wallet ownership%'
      AND position('network=mainnet' in message) > 0
      AND position('funds=none' in message) > 0
    ),
  CONSTRAINT stellar_mainnet_ownership_proofs_method_chk
    CHECK (method IN ('lobstr_sign_message', 'sign_message', 'outbound_memo_payment')),
  CONSTRAINT stellar_mainnet_ownership_proofs_tx_hash_chk
    CHECK (
      (method = 'outbound_memo_payment' AND tx_hash ~ '^[0-9a-fA-F]{64}$')
      OR (method <> 'outbound_memo_payment' AND tx_hash IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS stellar_mainnet_ownership_proofs_tx_hash_uidx
  ON public.stellar_mainnet_ownership_proofs (tx_hash)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS stellar_mainnet_ownership_proofs_pubkey_verified_idx
  ON public.stellar_mainnet_ownership_proofs (pubkey, verified_at DESC);

ALTER TABLE public.stellar_mainnet_ownership_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stellar_mainnet_ownership_proofs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.stellar_mainnet_ownership_proofs
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT
  ON TABLE public.stellar_mainnet_ownership_proofs
  TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stellar_mainnet_ownership_proofs'
      AND policyname = 'stellar_mainnet_ownership_proofs_no_client'
  ) THEN
    CREATE POLICY stellar_mainnet_ownership_proofs_no_client
      ON public.stellar_mainnet_ownership_proofs
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

COMMENT ON TABLE public.stellar_mainnet_ownership_proofs IS
  'Server-verified Mainnet destination ownership proofs. Public metadata only; no secrets.';
