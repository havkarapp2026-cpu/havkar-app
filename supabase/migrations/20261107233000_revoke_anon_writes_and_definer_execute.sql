-- Reduce GraphQL/table privilege surface and unnecessary SECURITY DEFINER EXECUTE.
-- Preserve authenticated RLS behavior and public-read SELECT where the app needs it.
-- Does not enable Mainnet or real payments. Reversible via re-GRANT if required.
--
-- Leaked password protection requires Supabase Pro and Auth dashboard/API access.
-- This org is on Free plan, so that control stays BLOCKED for the owner upgrade.

-- 1) Anon must not write any public table. Logged-in clients use the authenticated role.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon',
      r.table_name
    );
  END LOOP;
END $$;

-- 2) Private / owner-scoped tables: remove anon SELECT so they leave the anon GraphQL surface.
-- Authenticated SELECT stays for RLS-backed app reads.
REVOKE ALL ON TABLE public.wallets FROM anon;
REVOKE ALL ON TABLE public.wallet_transactions FROM anon;
REVOKE ALL ON TABLE public.wallet_transfers FROM anon;
REVOKE ALL ON TABLE public.wallet_exchanges FROM anon;
REVOKE ALL ON TABLE public.conversations FROM anon;
REVOKE ALL ON TABLE public.messages FROM anon;
REVOKE ALL ON TABLE public.message_reactions FROM anon;
REVOKE ALL ON TABLE public.notifications FROM anon;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.event_tickets FROM anon;
REVOKE ALL ON TABLE public.delivery_requests FROM anon;
REVOKE ALL ON TABLE public.driver_applications FROM anon;
REVOKE ALL ON TABLE public.business_applications FROM anon;
REVOKE ALL ON TABLE public.saved_items FROM anon;
REVOKE ALL ON TABLE public.saved_collections FROM anon;
REVOKE ALL ON TABLE public.privacy_requests FROM anon;
REVOKE ALL ON TABLE public.marketplace_payment_intents FROM anon;
REVOKE ALL ON TABLE public.stellar_ticket_payments FROM anon;
REVOKE ALL ON TABLE public.crypto_trades FROM anon;
REVOKE ALL ON TABLE public.event_user_actions FROM anon;
REVOKE ALL ON TABLE public.marketplace_orders FROM anon;
REVOKE ALL ON TABLE public.accommodation_credentials FROM anon;
REVOKE ALL ON TABLE public.accommodation_availability FROM anon;
REVOKE ALL ON TABLE public.accommodation_price_drafts FROM anon;
REVOKE ALL ON TABLE public.accommodation_owner_photos FROM anon;

GRANT SELECT ON TABLE public.wallets TO authenticated;
GRANT SELECT ON TABLE public.wallet_transactions TO authenticated;
GRANT SELECT ON TABLE public.wallet_transfers TO authenticated;
GRANT SELECT ON TABLE public.wallet_exchanges TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.message_reactions TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.event_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.driver_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_collections TO authenticated;
GRANT SELECT, INSERT ON TABLE public.privacy_requests TO authenticated;
GRANT SELECT ON TABLE public.marketplace_payment_intents TO authenticated;

-- 3) SECURITY DEFINER: revoke client EXECUTE that is not needed for app RPC / RLS helpers.
REVOKE ALL ON FUNCTION public.transfer_money(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_money(uuid, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION havkar_private.enforce_owner_identity_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION havkar_private.record_service_commission_liability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.record_service_commission_liability() TO service_role;

REVOKE ALL ON FUNCTION havkar_private.jwt_role_generation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION havkar_private.jwt_session_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION havkar_private.session_is_live(uuid) FROM PUBLIC, anon, authenticated;

-- Keep RLS/public helpers callable where policies or UI require them.
GRANT EXECUTE ON FUNCTION havkar_private.listing_is_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.job_publicly_visible(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_interest_counts() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delivery(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_status(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ad_has_blocking_dependencies(bigint) TO authenticated;
