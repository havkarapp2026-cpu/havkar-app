INSERT INTO auth.users (id, email_confirmed_at) VALUES
  ('11111111-1111-4111-8111-111111111111', now()),
  ('22222222-2222-4222-8222-222222222222', now()),
  ('33333333-3333-4333-8333-333333333333', now());

INSERT INTO public.accommodation_reviewers (user_id, active)
VALUES ('33333333-3333-4333-8333-333333333333', true);

GRANT SELECT, INSERT ON storage.objects TO anon, authenticated, service_role;

SELECT set_config('havkar.test_uid', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

INSERT INTO public.accommodation_operators (user_id, legal_name, acting_as)
VALUES ('11111111-1111-4111-8111-111111111111', 'Owner Example', 'owner');

INSERT INTO public.accommodation_properties (
  operator_id, marketing_type, legal_category, display_name
)
SELECT id, 'apartment', 'short_let', 'Draft apartment'
FROM public.accommodation_operators
WHERE user_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.accommodation_addresses (
  property_id, country_code, city, street, cadastral_sheet, cadastral_parcel, cadastral_subaltern
)
SELECT id, 'IT', 'Crotone', 'Via Example 1', '10', '20', '30'
FROM public.accommodation_properties
WHERE display_name = 'Draft apartment';

INSERT INTO public.accommodation_credentials (
  property_id, credential_type, credential_value, issuing_country
)
SELECT id, 'cin', 'abcdefghi123456', 'IT'
FROM public.accommodation_properties
WHERE display_name = 'Draft apartment';

INSERT INTO public.accommodation_evidence (
  property_id, evidence_type, storage_path, content_sha256, byte_size, mime_type
)
SELECT id, 'cin_record',
  '11111111-1111-4111-8111-111111111111/' || id::text || '/cin_record/cin.pdf',
  repeat('cd', 32), 1200, 'application/pdf'
FROM public.accommodation_properties
WHERE display_name = 'Draft apartment';

INSERT INTO storage.objects (bucket_id, name)
SELECT 'accommodation-evidence',
  '11111111-1111-4111-8111-111111111111/' || id::text || '/cin_record/cin.pdf'
FROM public.accommodation_properties
WHERE display_name = 'Draft apartment';

UPDATE public.accommodation_properties
SET property_status = 'submitted'
WHERE display_name = 'Draft apartment';

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_credentials
    WHERE credential_value = 'ABCDEFGHI123456'
  ) THEN
    RAISE EXCEPTION 'CIN was not normalized.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_identity_checks
    WHERE status = 'blocked' AND provider = 'none'
  ) THEN
    RAISE EXCEPTION 'Identity check was not blocked.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accommodation_listings
    WHERE publication_status = 'published'
  ) THEN
    RAISE EXCEPTION 'A listing was published.';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.accommodation_operators
    SET identity_status = 'verified';
    RAISE EXCEPTION 'Identity update unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%Identity verification cannot be recorded%' THEN
        RAISE;
      END IF;
  END;
END $$;

SELECT set_config('havkar.property_decision', 'allow', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.accommodation_properties
    SET property_status = 'approved'
    WHERE display_name = 'Draft apartment';
    RAISE EXCEPTION 'Browser property approval unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%Property status can only change%' THEN
        RAISE;
      END IF;
  END;
END $$;
RESET ROLE;
SELECT set_config('havkar.property_decision', '', false);

SET ROLE service_role;
DO $$
DECLARE
  changed integer;
BEGIN
  BEGIN
    UPDATE public.accommodation_listings
    SET publication_status = 'published', published_at = now();
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN
      RAISE EXCEPTION 'Service role publication unexpectedly changed rows.';
    END IF;
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%Publication requires a verified identity%' THEN
        RAISE;
      END IF;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'havkar_bypass_test') THEN
    CREATE ROLE havkar_bypass_test NOLOGIN BYPASSRLS;
  END IF;
END $$;
GRANT SELECT, UPDATE ON public.accommodation_listings TO havkar_bypass_test;
GRANT SELECT ON public.accommodation_properties, public.accommodation_operators, public.accommodation_addresses, public.accommodation_country_rules TO havkar_bypass_test;
SET ROLE havkar_bypass_test;
DO $$
BEGIN
  BEGIN
    UPDATE public.accommodation_listings
    SET publication_status = 'published', published_at = now();
    RAISE EXCEPTION 'Bypass role publication unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%Publication requires a verified identity%' THEN
        RAISE;
      END IF;
  END;
END $$;
RESET ROLE;

SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.decide_accommodation_review(
      '33333333-3333-4333-8333-333333333333'::uuid,
      (SELECT id FROM public.accommodation_properties WHERE display_name = 'Draft apartment'),
      'approved',
      'notes'
    );
    RAISE EXCEPTION 'Authenticated review call unexpectedly succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;
RESET ROLE;

SET ROLE service_role;
SELECT public.decide_accommodation_review(
  '33333333-3333-4333-8333-333333333333'::uuid,
  (SELECT id FROM public.accommodation_properties WHERE display_name = 'Draft apartment'),
  'approved',
  'Property record checked.'
);
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_properties
    WHERE display_name = 'Draft apartment' AND property_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Reviewer decision did not approve the property.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accommodation_operators
    WHERE identity_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'Property approval verified the identity.';
  END IF;
END $$;

SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.publish_accommodation_listing(
      '33333333-3333-4333-8333-333333333333'::uuid,
      (SELECT id FROM public.accommodation_listings)
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

SELECT set_config('havkar.test_uid', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;
INSERT INTO public.accommodation_operators (user_id, legal_name, acting_as)
VALUES ('22222222-2222-4222-8222-222222222222', 'Second Owner', 'owner');

INSERT INTO public.accommodation_properties (
  operator_id, marketing_type, legal_category, display_name
)
SELECT id, 'villa', 'tourist_lease', 'Second draft'
FROM public.accommodation_operators
WHERE user_id = '22222222-2222-4222-8222-222222222222';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.accommodation_credentials (
      property_id, credential_type, credential_value, issuing_country
    )
    SELECT id, 'cin', 'ABCDEFGHI123456', 'IT'
    FROM public.accommodation_properties
    WHERE display_name = 'Second draft';
    RAISE EXCEPTION 'Duplicate CIN unexpectedly succeeded.';
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM NOT LIKE '%Duplicate CIN%' THEN
        RAISE;
      END IF;
  END;
END $$;

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*) INTO visible FROM public.accommodation_evidence;
  IF visible <> 0 THEN
    RAISE EXCEPTION 'Another user could read evidence.';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES (
      'accommodation-evidence',
      '11111111-1111-4111-8111-111111111111/property/identity/passport.pdf'
    );
    RAISE EXCEPTION 'Identity storage upload unexpectedly succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.accommodation_evidence (
      property_id, evidence_type, storage_path, content_sha256, byte_size, mime_type
    )
    SELECT id, 'identity_document',
      '22222222-2222-4222-8222-222222222222/' || id::text || '/identity/file.pdf',
      repeat('ab', 32), 10, 'application/pdf'
    FROM public.accommodation_properties
    WHERE display_name = 'Second draft';
    RAISE EXCEPTION 'Identity evidence unexpectedly succeeded.';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config('havkar.test_uid', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;
DO $$
DECLARE
  visible integer;
  stored integer;
BEGIN
  SELECT count(*) INTO visible
  FROM public.accommodation_evidence;
  SELECT count(*) INTO stored
  FROM storage.objects
  WHERE bucket_id = 'accommodation-evidence';
  IF visible <> 0 OR stored <> 0 THEN
    RAISE EXCEPTION 'Unauthorized evidence access returned rows.';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('havkar.test_uid', '33333333-3333-4333-8333-333333333333', false);
SET ROLE authenticated;
DO $$
DECLARE
  visible integer;
  stored integer;
BEGIN
  SELECT count(*) INTO visible FROM public.accommodation_evidence;
  SELECT count(*) INTO stored
  FROM storage.objects
  WHERE bucket_id = 'accommodation-evidence';
  IF visible <> 1 OR stored <> 1 THEN
    RAISE EXCEPTION 'Reviewer could not read the private evidence.';
  END IF;
END $$;
RESET ROLE;

SET ROLE anon;
DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*) INTO visible FROM public.accommodation_listings;
  IF visible <> 0 THEN
    RAISE EXCEPTION 'Anonymous user saw an unpublished listing.';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  priced integer;
  bucket_public boolean;
BEGIN
  SELECT count(*) INTO priced
  FROM public.accommodation_plans
  WHERE monthly_amount_cents IS NOT NULL
     OR stripe_price_id IS NOT NULL
     OR status <> 'draft';
  SELECT public INTO bucket_public
  FROM storage.buckets
  WHERE id = 'accommodation-evidence';
  IF priced <> 0 OR bucket_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'A price or public evidence bucket was created.';
  END IF;

  IF NOT has_function_privilege('anon', 'havkar_private.job_publicly_visible(bigint)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'havkar_private.job_publicly_visible(bigint)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'havkar_private.job_publicly_visible(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Existing private function execute was revoked.';
  END IF;

  BEGIN
    UPDATE public.accommodation_plans
    SET monthly_amount_cents = 1900;
    RAISE EXCEPTION 'A subscription price was stored.';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END $$;

SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.accommodation_reviewers (user_id, active)
    VALUES ('11111111-1111-4111-8111-111111111111', true);
    RAISE EXCEPTION 'A user assigned their own reviewer role.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;
RESET ROLE;

GRANT SELECT, UPDATE ON public.accommodation_operators TO havkar_bypass_test;
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

SELECT 'ACCOMMODATION_PHASE1_OK';
