INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

INSERT INTO public.events (id, title, price, is_public, status, organizer)
VALUES (1, 'Local event', '5.00', true, 'active', 'HAVKAR');

INSERT INTO public.event_tickets (
  user_id, event_id, quantity, unit_price, currency, total_amount,
  payment_status, ticket_status, payment_provider
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  1, 1, 5, 'EUR', 5, 'pending', 'pending', 'stellar_testnet'
);

INSERT INTO public.stellar_ticket_payments (
  user_id, event_ticket_id, event_id, network, status,
  destination_public_key, eur_amount, eur_per_xlm, quote_source, quoted_at,
  amount_stroops, amount_xlm, payment_reference, memo, expires_at
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  1, 1, 'TESTNET', 'PENDING',
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  5, 0.25, 'test-fixture', now(),
  200000000, '20.0000000', 'hk0123456789abcdef01234567', 'hk0123456789abcdef01234567',
  now() + interval '10 minutes'
);

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SET ROLE authenticated;
SELECT COUNT(*) AS other_user_rows FROM public.stellar_ticket_payments;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.stellar_ticket_payments (
      user_id, event_ticket_id, event_id, destination_public_key,
      eur_amount, eur_per_xlm, quote_source, quoted_at, amount_stroops,
      amount_xlm, payment_reference, memo, expires_at
    ) VALUES (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 1,
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      5, 0.25, 'test-fixture', now(), 1, '0.0000001',
      'hkffffffffffffffffffffffff', 'hkffffffffffffffffffffffff', now()
    );
    RAISE EXCEPTION 'authenticated insert was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM public.confirm_stellar_ticket_payment(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      repeat('ab', 32),
      1,
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
    );
    RAISE EXCEPTION 'authenticated confirm was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;
SELECT COUNT(*) AS owner_rows FROM public.stellar_ticket_payments;
RESET ROLE;

SELECT 'STELLAR_PAYMENT_RLS_OK';
