-- Remove client EXECUTE grants that HAVKAR does not use.
-- Function bodies, security mode, triggers, tables, and policies stay unchanged.

REVOKE EXECUTE ON FUNCTION public.accept_delivery(bigint)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_delivery_status(bigint, text)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_user_wallet()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
