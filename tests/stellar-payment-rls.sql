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
  user_id, event_ticket_id, event_id, service_type, service_id, network, status,
  destination_public_key, eur_amount, eur_per_xlm, quote_source, quoted_at,
  amount_stroops, amount_xlm, payment_reference, memo, expires_at
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  1, 1, 'event_ticket', '1', 'TESTNET', 'PENDING',
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
      user_id, event_ticket_id, event_id, service_type, service_id,
      destination_public_key, eur_amount, eur_per_xlm, quote_source, quoted_at,
      amount_stroops, amount_xlm, payment_reference, memo, expires_at
    ) VALUES (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 1, 'event_ticket', '1',
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

CREATE TABLE public.jobs (
  id bigint PRIMARY KEY,
  user_id uuid NOT NULL,
  title text,
  company text,
  status text,
  plan text,
  monthly_fee numeric
);

INSERT INTO public.jobs (id, user_id, title, company, status, plan, monthly_fee)
VALUES (
  77,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Kitchen role',
  'HAVKAR',
  'pending_payment',
  'Basic',
  9.99
);

INSERT INTO public.stellar_ticket_payments (
  id, user_id, service_type, service_id, network, status,
  destination_public_key, eur_amount, eur_per_xlm, quote_source, quoted_at,
  amount_stroops, amount_xlm, payment_reference, memo, expires_at
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'job_listing', '77', 'TESTNET', 'AWAITING_SIGNATURE',
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  9.99, 0.25, 'test-fixture', now(),
  399600000, '39.9600000', 'hkcccccccccccccccccccccccc', 'hkcccccccccccccccccccccccc',
  now() + interval '10 minutes'
);

SELECT public.confirm_stellar_ticket_payment(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  repeat('ab', 32),
  1,
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
);

SELECT status AS job_after_confirm FROM public.jobs WHERE id = 77;

INSERT INTO public.stellar_payment_refunds (
  id, payment_id, user_id, status, amount_stroops, amount_xlm,
  source_public_key, destination_public_key, memo
) VALUES (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'REFUND_PENDING',
  399600000,
  '39.9600000',
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  'hkcccccccccccccccccccccccc'
);

SELECT public.confirm_stellar_refund(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  repeat('cd', 32),
  2
);

SELECT status AS job_after_refund FROM public.jobs WHERE id = 77;

SELECT 'STELLAR_PAYMENT_RLS_OK';
