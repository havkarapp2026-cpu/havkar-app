-- Harden conversation party fields and stop client-forged wallet exchange rows.
-- Chat only needs updated_at on conversations. Fiat transfers remain disabled.
-- Reversible: drop trigger/function and restore prior policies if required.

CREATE OR REPLACE FUNCTION public.prevent_conversation_party_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.ad_id IS DISTINCT FROM OLD.ad_id THEN
    RAISE EXCEPTION 'conversation parties cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_conversation_party_change
  ON public.conversations;

CREATE TRIGGER prevent_conversation_party_change
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_conversation_party_change();

REVOKE ALL ON FUNCTION public.prevent_conversation_party_change() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can create their own exchanges" ON public.wallet_exchanges;
DROP POLICY IF EXISTS "Users can update their own exchanges" ON public.wallet_exchanges;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.wallet_exchanges
  FROM anon, authenticated;

GRANT SELECT ON TABLE public.wallet_exchanges TO authenticated;
REVOKE ALL ON TABLE public.wallet_exchanges FROM anon;

ALTER TABLE public.wallet_exchanges FORCE ROW LEVEL SECURITY;

COMMENT ON FUNCTION public.prevent_conversation_party_change() IS
  'Blocks buyer_id/seller_id/ad_id rewrites on conversations while allowing updated_at.';
