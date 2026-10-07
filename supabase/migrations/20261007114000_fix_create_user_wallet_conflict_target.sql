-- The wallets unique key is (user_id, currency).
-- ON CONFLICT (user_id) does not match that key and aborts new Auth signups.

CREATE OR REPLACE FUNCTION public.create_user_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (user_id, currency, balance)
  VALUES (NEW.id, 'EUR', 0)
  ON CONFLICT (user_id, currency) DO NOTHING;

  RETURN NEW;
END;
$function$;
