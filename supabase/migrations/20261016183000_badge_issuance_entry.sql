-- Authorized badge issuance entry points.
-- This file does not enable issuance, assign an Owner, or assign an Admin.
-- Do not apply it to production project gispovnciifgikvgpzck.

CREATE OR REPLACE FUNCTION public.award_badge(
  target_user uuid,
  target_code text,
  target_subject_type text,
  target_subject uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT havkar_private.award_badge(
    target_user,
    target_code,
    target_subject_type,
    target_subject
  );
$$;

COMMENT ON FUNCTION public.award_badge(uuid, text, text, uuid) IS
  'Calls the private award. A different live Owner or Admin is required. The account holder cannot award it.';

REVOKE ALL ON FUNCTION public.award_badge(uuid, text, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.award_badge(uuid, text, text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION havkar_private.award_badge(uuid, text, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.award_badge(uuid, text, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.record_reputation_event(
  target_user uuid,
  target_event text,
  target_source_table text,
  target_source_id text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT havkar_private.record_reputation_event(
    target_user,
    target_event,
    target_source_table,
    target_source_id
  );
$$;

COMMENT ON FUNCTION public.record_reputation_event(uuid, text, text, text) IS
  'Records 20 points for one delivered delivery or completed service booking. The account holder cannot record it.';

REVOKE ALL ON FUNCTION public.record_reputation_event(uuid, text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_reputation_event(uuid, text, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION havkar_private.record_reputation_event(uuid, text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.record_reputation_event(uuid, text, text, text)
  TO authenticated;

UPDATE havkar_private.badge_definitions
SET eligibility = CASE code
  WHEN 'identity_verified' THEN
    'Green check only after an authorized manager reviews the person. The account email must be confirmed. Signup and the account holder cannot award it.'
  WHEN 'business_verified' THEN
    'Green star only after official business approval. The star belongs to a page owned by that user, and the user must already have an approved business application. Publication alone does not award it.'
  WHEN 'diamond' THEN
    'Diamond requires an account age of 30 days and 100 points. A delivered delivery or a completed service booking adds 20 points once. Payments, signups, and self-written text do not count. The account holder cannot record or award it.'
  ELSE eligibility
END
WHERE code IN ('identity_verified', 'business_verified', 'diamond');
