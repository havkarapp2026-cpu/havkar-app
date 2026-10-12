SELECT set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

DO $$
BEGIN
  BEGIN
    UPDATE public.accommodation_properties
    SET display_name = 'Changed after approval'
    WHERE display_name = 'Draft apartment';
    RAISE EXCEPTION 'Approved application edit unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%can no longer be changed%' THEN
        RAISE;
      END IF;
  END;
END $$;

RESET ROLE;
SELECT set_config('havkar.test_uid', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.accommodation_addresses (
      property_id, country_code, city, street
    )
    SELECT id, 'IT', 'Roma', 'Via Nazionale'
    FROM public.accommodation_properties
    WHERE display_name = 'Second draft';
    RAISE EXCEPTION 'Address without a building number unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%Building number is required%' THEN
        RAISE;
      END IF;
  END;
END $$;

RESET ROLE;
SELECT set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

INSERT INTO public.accommodation_properties (
  operator_id, marketing_type, legal_category, display_name
)
SELECT id, 'hotel', 'hotel_structure', 'Phase2 house'
FROM public.accommodation_operators
WHERE user_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.accommodation_addresses (
  property_id, country_code, city, street, street_number
)
SELECT id, 'IT', 'Roma', 'Via Nazionale', '12'
FROM public.accommodation_properties
WHERE display_name = 'Phase2 house';

INSERT INTO public.accommodation_credentials (
  property_id, credential_type, credential_value, issuing_country
)
SELECT id, 'cin', 'phase2cin123456', 'IT'
FROM public.accommodation_properties
WHERE display_name = 'Phase2 house';

RESET ROLE;
UPDATE auth.users
SET email_confirmed_at = NULL
WHERE id = '11111111-1111-4111-8111-111111111111';

SELECT set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

DO $$
BEGIN
  BEGIN
    UPDATE public.accommodation_properties
    SET property_status = 'submitted'
    WHERE display_name = 'Phase2 house';
    RAISE EXCEPTION 'Unconfirmed submission unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%confirmed email%' THEN
        RAISE;
      END IF;
  END;
END $$;

RESET ROLE;
UPDATE auth.users
SET email_confirmed_at = now()
WHERE id = '11111111-1111-4111-8111-111111111111';

SELECT set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

UPDATE public.accommodation_properties
SET property_status = 'submitted'
WHERE display_name = 'Phase2 house';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_properties
    WHERE display_name = 'Phase2 house' AND property_status = 'submitted'
  ) THEN
    RAISE EXCEPTION 'Owner submission did not reach submitted.';
  END IF;
  IF (
    SELECT count(*) FROM public.accommodation_listings listing
    JOIN public.accommodation_properties property ON property.id = listing.property_id
    WHERE property.display_name = 'Phase2 house'
  ) <> 1 THEN
    RAISE EXCEPTION 'Submission created a duplicate listing.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accommodation_listings
    WHERE publication_status = 'published'
  ) THEN
    RAISE EXCEPTION 'Submission published a listing.';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.accommodation_addresses
    SET street_number = '99'
    WHERE property_id = (
      SELECT id FROM public.accommodation_properties WHERE display_name = 'Phase2 house'
    );
    RAISE EXCEPTION 'Submitted address edit unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%can no longer be changed%' THEN
        RAISE;
      END IF;
  END;
END $$;

UPDATE public.accommodation_properties
SET property_status = 'submitted'
WHERE display_name = 'Phase2 house';

RESET ROLE;

SELECT set_config('havkar.test_uid', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;

UPDATE public.accommodation_properties
SET display_name = 'Taken over'
WHERE display_name = 'Phase2 house';

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_properties
    WHERE display_name = 'Phase2 house' AND property_status = 'submitted'
  ) THEN
    RAISE EXCEPTION 'Another owner changed the submitted application.';
  END IF;
END $$;

INSERT INTO auth.users (id, email_confirmed_at)
VALUES ('44444444-4444-4444-8444-444444444444', NULL);

SELECT set_config('havkar.test_uid', '44444444-4444-4444-8444-444444444444', false);
SET ROLE authenticated;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.accommodation_operators (user_id, legal_name, acting_as)
    VALUES ('44444444-4444-4444-8444-444444444444', 'Unconfirmed Owner', 'owner');
    RAISE EXCEPTION 'Unconfirmed operator unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%confirmed email%' THEN
        RAISE;
      END IF;
  END;
END $$;

RESET ROLE;
SELECT set_config(
  'havkar.phase2_operator',
  (
    SELECT id::text
    FROM public.accommodation_operators
    WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ),
  false
);
SELECT set_config('havkar.test_uid', '44444444-4444-4444-8444-444444444444', false);
SET ROLE authenticated;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.accommodation_properties (
      operator_id, marketing_type, legal_category, display_name
    )
    VALUES (
      current_setting('havkar.phase2_operator')::uuid,
      'hotel',
      'hotel_structure',
      'Unconfirmed house'
    );
    RAISE EXCEPTION 'Unconfirmed property insert unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%confirmed email%' THEN
        RAISE;
      END IF;
  END;
END $$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.accommodation_credentials;
    RAISE EXCEPTION 'Anonymous credential read unexpectedly succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE
  rule text;
BEGIN
  SELECT qual INTO rule
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'accommodation_credentials'
    AND policyname = 'accommodation_public_credentials';

  IF rule ILIKE '%cin%' OR rule ILIKE '%regional_code%' THEN
    RAISE EXCEPTION 'Public credential policy still exposes a registration code.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE policyname = 'accommodation_public_credentials'
      AND 'anon' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'Anonymous role remains on the public credential policy.';
  END IF;

  IF NOT has_function_privilege('anon', 'havkar_private.job_publicly_visible(bigint)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'havkar_private.job_publicly_visible(bigint)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'havkar_private.job_publicly_visible(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Existing private function execute was revoked.';
  END IF;
END $$;

SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.publish_accommodation_listing(
      '33333333-3333-4333-8333-333333333333'::uuid,
      (SELECT id FROM public.accommodation_listings LIMIT 1)
    );
    RAISE EXCEPTION 'Publication unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%Publication requires a verified identity%' THEN
        RAISE;
      END IF;
  END;
END $$;
RESET ROLE;

SET ROLE havkar_bypass_test;
DO $$
BEGIN
  BEGIN
    UPDATE public.accommodation_operators
    SET identity_status = 'verified';
    RAISE EXCEPTION 'Bypass role verified an identity.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%Identity verification cannot be recorded%' THEN
        RAISE;
      END IF;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE
  priced integer;
BEGIN
  SELECT count(*) INTO priced
  FROM public.accommodation_plans
  WHERE monthly_amount_cents IS NOT NULL
     OR stripe_price_id IS NOT NULL
     OR status <> 'draft';
  IF priced <> 0 THEN
    RAISE EXCEPTION 'A subscription price was stored.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accommodation_operators
    WHERE identity_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'An identity was verified.';
  END IF;
END $$;

SELECT 'ACCOMMODATION_PHASE2_OK';
