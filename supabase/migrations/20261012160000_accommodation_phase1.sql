-- HAVKAR accommodation phase 1.
-- Independent of ads, jobs, services, and tickets.
-- This file is not applied to production by the repository itself.
--
-- Identity Verified cannot be stored in this phase. A later migration
-- may allow it only after a contracted identity provider is connected.
-- Property review and publication are separate. Publication also
-- requires a verified identity, so no listing can be published yet.
-- Subscription prices and payment identifiers stay empty.

CREATE SCHEMA IF NOT EXISTS havkar_private;

-- Do not revoke existing privileges. havkar_private already holds
-- Jobs and Services functions, including job_publicly_visible, which
-- the public jobs policy executes.
GRANT USAGE ON SCHEMA havkar_private TO service_role;

CREATE OR REPLACE FUNCTION havkar_private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.touch_updated_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.accommodation_country_rules (
  country_code char(2) PRIMARY KEY CHECK (country_code ~ '^[A-Z]{2}$'),
  publish_enabled boolean NOT NULL DEFAULT false,
  requires_cin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.accommodation_country_rules (
  country_code,
  publish_enabled,
  requires_cin
) VALUES (
  'IT',
  true,
  true
);

CREATE TABLE public.accommodation_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  legal_name text NOT NULL CHECK (char_length(btrim(legal_name)) BETWEEN 2 AND 160),
  acting_as text NOT NULL CHECK (acting_as IN ('owner', 'legal_representative')),
  phone_e164 text,
  phone_confirmed_at timestamptz,
  identity_status text NOT NULL DEFAULT 'not_started',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_identity_status_check CHECK (
    identity_status IN (
      'not_started',
      'awaiting_provider',
      'needs_more_info',
      'rejected',
      'suspended'
    )
  ),
  CONSTRAINT accommodation_phone_not_confirmed_yet CHECK (phone_confirmed_at IS NULL)
);

CREATE TABLE public.accommodation_identity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL UNIQUE REFERENCES public.accommodation_operators (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'none',
  status text NOT NULL DEFAULT 'blocked',
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_identity_provider_check CHECK (provider = 'none'),
  CONSTRAINT accommodation_identity_check_status_check CHECK (status = 'blocked'),
  CONSTRAINT accommodation_identity_reference_empty CHECK (provider_reference IS NULL)
);

CREATE TABLE public.accommodation_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.accommodation_operators (id) ON DELETE CASCADE,
  marketing_type text NOT NULL CHECK (
    marketing_type IN (
      'hotel',
      'bnb',
      'apartment',
      'holiday_home',
      'villa',
      'guesthouse'
    )
  ),
  legal_category text NOT NULL CHECK (
    legal_category IN (
      'hotel_structure',
      'non_hotel_structure',
      'short_let',
      'tourist_lease'
    )
  ),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 160),
  property_status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_property_status_check CHECK (
    property_status IN (
      'draft',
      'submitted',
      'in_review',
      'needs_more_info',
      'approved',
      'rejected',
      'suspended',
      'revoked'
    )
  )
);

CREATE INDEX accommodation_properties_operator_idx
  ON public.accommodation_properties (operator_id);

CREATE TABLE public.accommodation_addresses (
  property_id uuid PRIMARY KEY REFERENCES public.accommodation_properties (id) ON DELETE CASCADE,
  country_code char(2) NOT NULL REFERENCES public.accommodation_country_rules (country_code),
  region text,
  city text NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 120),
  postal_code text,
  street text NOT NULL CHECK (char_length(btrim(street)) BETWEEN 1 AND 160),
  street_number text,
  unit_label text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  cadastral_sheet text,
  cadastral_parcel text,
  cadastral_subaltern text,
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE UNIQUE INDEX accommodation_addresses_cadastral_uidx
  ON public.accommodation_addresses (
    country_code,
    cadastral_sheet,
    cadastral_parcel,
    cadastral_subaltern
  )
  WHERE cadastral_sheet IS NOT NULL
    AND cadastral_parcel IS NOT NULL
    AND cadastral_subaltern IS NOT NULL;

CREATE TABLE public.accommodation_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.accommodation_properties (id) ON DELETE CASCADE,
  credential_type text NOT NULL CHECK (
    credential_type IN ('cin', 'regional_code', 'local_permit')
  ),
  credential_value text NOT NULL CHECK (char_length(btrim(credential_value)) BETWEEN 1 AND 64),
  issuing_country char(2) NOT NULL CHECK (issuing_country ~ '^[A-Z]{2}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, credential_type)
);

CREATE TABLE public.accommodation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.accommodation_properties (id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (
    evidence_type IN (
      'ownership_record',
      'management_mandate',
      'cin_record',
      'regional_code',
      'local_permit',
      'exterior_photo',
      'safety_declaration'
    )
  ),
  storage_path text NOT NULL CHECK (char_length(storage_path) BETWEEN 8 AND 400),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  mime_type text NOT NULL CHECK (
    mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.accommodation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.accommodation_properties (id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users (id),
  decision text NOT NULL CHECK (
    decision IN ('needs_more_info', 'rejected', 'approved', 'suspended', 'revoked')
  ),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision <> 'verified')
);

CREATE TABLE public.accommodation_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL UNIQUE REFERENCES public.accommodation_properties (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 160),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 4000),
  publication_status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_publication_status_check CHECK (
    publication_status IN ('draft', 'published', 'hidden', 'removed')
  ),
  CONSTRAINT accommodation_published_timestamp_check CHECK (
    (publication_status = 'published' AND published_at IS NOT NULL)
    OR (publication_status <> 'published' AND published_at IS NULL)
  )
);

CREATE TABLE public.accommodation_listing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.accommodation_listings (id) ON DELETE CASCADE,
  storage_path text NOT NULL CHECK (char_length(storage_path) BETWEEN 8 AND 400),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.accommodation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.accommodation_listings (id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users (id),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'upheld')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.accommodation_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL CHECK (char_length(action) BETWEEN 2 AND 80),
  entity_name text NOT NULL,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.accommodation_reviewers (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.accommodation_plans (
  code text PRIMARY KEY CHECK (code IN ('basic', 'professional', 'business')),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  monthly_amount_cents integer,
  status text NOT NULL DEFAULT 'draft',
  stripe_price_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_plan_not_priced CHECK (monthly_amount_cents IS NULL),
  CONSTRAINT accommodation_plan_not_for_sale CHECK (status = 'draft'),
  CONSTRAINT accommodation_plan_no_payment_id CHECK (stripe_price_id IS NULL)
);

INSERT INTO public.accommodation_plans (code) VALUES
  ('basic'),
  ('professional'),
  ('business');

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.accommodation_operators,
  public.accommodation_identity_checks,
  public.accommodation_properties,
  public.accommodation_addresses,
  public.accommodation_credentials,
  public.accommodation_evidence,
  public.accommodation_reviews,
  public.accommodation_listings,
  public.accommodation_listing_photos,
  public.accommodation_reports,
  public.accommodation_audit_events,
  public.accommodation_reviewers,
  public.accommodation_plans,
  public.accommodation_country_rules
TO service_role;

CREATE OR REPLACE FUNCTION havkar_private.guard_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.identity_status = 'verified' THEN
    RAISE EXCEPTION 'Identity verification cannot be recorded in this phase.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.phone_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Phone verification is not connected.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.identity_status IS DISTINCT FROM 'not_started' THEN
    RAISE EXCEPTION 'Identity status starts unverified.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.identity_status IS DISTINCT FROM OLD.identity_status THEN
    RAISE EXCEPTION 'Identity verification cannot be recorded in this phase.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM auth.users
      WHERE id = NEW.user_id
        AND email_confirmed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'A confirmed email is required.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.guard_operator() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS accommodation_operators_guard ON public.accommodation_operators;
CREATE TRIGGER accommodation_operators_guard
  BEFORE INSERT OR UPDATE ON public.accommodation_operators
  FOR EACH ROW EXECUTE FUNCTION havkar_private.guard_operator();

CREATE TRIGGER accommodation_operators_touch
  BEFORE UPDATE ON public.accommodation_operators
  FOR EACH ROW EXECUTE FUNCTION havkar_private.touch_updated_at();

CREATE OR REPLACE FUNCTION havkar_private.block_identity_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'verified' OR NEW.provider IS DISTINCT FROM 'none' OR NEW.provider_reference IS NOT NULL THEN
    RAISE EXCEPTION 'Identity verification cannot be recorded in this phase.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Identity checks stay blocked until a provider is connected.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accommodation_identity_checks_block ON public.accommodation_identity_checks;
CREATE TRIGGER accommodation_identity_checks_block
  BEFORE INSERT OR UPDATE ON public.accommodation_identity_checks
  FOR EACH ROW EXECUTE FUNCTION havkar_private.block_identity_checks();

CREATE OR REPLACE FUNCTION havkar_private.create_identity_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accommodation_identity_checks (operator_id, provider, status)
  VALUES (NEW.id, 'none', 'blocked');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accommodation_operators_identity_check ON public.accommodation_operators;
CREATE TRIGGER accommodation_operators_identity_check
  AFTER INSERT ON public.accommodation_operators
  FOR EACH ROW EXECUTE FUNCTION havkar_private.create_identity_check();

CREATE OR REPLACE FUNCTION havkar_private.guard_property()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  property_country char(2);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.property_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'A property starts as a draft.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.property_status IS DISTINCT FROM OLD.property_status THEN
    SELECT operator.user_id INTO owner_id
    FROM public.accommodation_operators operator
    WHERE operator.id = NEW.operator_id;

    IF OLD.property_status IN ('draft', 'needs_more_info')
       AND NEW.property_status = 'submitted'
       AND current_user = 'authenticated'
       AND auth.uid() = owner_id THEN
      SELECT a.country_code INTO property_country
      FROM public.accommodation_addresses a
      WHERE a.property_id = NEW.id;

      IF property_country IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.accommodation_country_rules r
        WHERE r.country_code = property_country
          AND r.publish_enabled
      ) THEN
        RAISE EXCEPTION 'Submission is open for Italy only.'
          USING ERRCODE = 'check_violation';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.accommodation_country_rules r
        WHERE r.country_code = property_country
          AND r.requires_cin
      ) AND NOT EXISTS (
        SELECT 1 FROM public.accommodation_credentials c
        WHERE c.property_id = NEW.id
          AND c.credential_type = 'cin'
          AND c.credential_value ~ '^[A-Z0-9]{15}$'
      ) THEN
        RAISE EXCEPTION 'A 15 character CIN is required before submission.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF current_setting('havkar.property_decision', true) = 'allow'
          AND current_user = (
            SELECT pg_catalog.pg_get_userbyid(proc.proowner)
            FROM pg_catalog.pg_proc proc
            JOIN pg_catalog.pg_namespace namespace
              ON namespace.oid = proc.pronamespace
            WHERE proc.proname = 'decide_accommodation_review'
              AND namespace.nspname = 'public'
          ) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Property status can only change through review or owner submission.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accommodation_properties_guard ON public.accommodation_properties;
CREATE TRIGGER accommodation_properties_guard
  BEFORE INSERT OR UPDATE ON public.accommodation_properties
  FOR EACH ROW EXECUTE FUNCTION havkar_private.guard_property();

CREATE TRIGGER accommodation_properties_touch
  BEFORE UPDATE ON public.accommodation_properties
  FOR EACH ROW EXECUTE FUNCTION havkar_private.touch_updated_at();

CREATE OR REPLACE FUNCTION havkar_private.guard_cin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := upper(btrim(NEW.credential_value));
BEGIN
  NEW.credential_value := normalized;
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized || ':' || NEW.issuing_country::text, 0));

  IF NEW.credential_type = 'cin' AND NEW.issuing_country = 'IT' AND normalized !~ '^[A-Z0-9]{15}$' THEN
    RAISE EXCEPTION 'Italian CIN must be 15 letters or digits.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.credential_type = 'cin' AND EXISTS (
    SELECT 1
    FROM public.accommodation_credentials existing
    JOIN public.accommodation_properties property
      ON property.id = existing.property_id
    WHERE existing.credential_type = 'cin'
      AND existing.issuing_country = NEW.issuing_country
      AND existing.credential_value = normalized
      AND existing.property_id <> NEW.property_id
      AND property.property_status NOT IN ('rejected', 'revoked')
  ) THEN
    RAISE EXCEPTION 'Duplicate CIN.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.guard_cin() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS accommodation_credentials_cin ON public.accommodation_credentials;
CREATE TRIGGER accommodation_credentials_cin
  BEFORE INSERT OR UPDATE ON public.accommodation_credentials
  FOR EACH ROW EXECUTE FUNCTION havkar_private.guard_cin();

CREATE OR REPLACE FUNCTION havkar_private.guard_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  segments text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Submitted evidence cannot be rewritten.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.evidence_type ~* 'identity|passport|selfie|id_document' THEN
    RAISE EXCEPTION 'Identity document upload is not open.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.storage_path ~* '(^|/)identity(/|$)|passport|selfie' THEN
    RAISE EXCEPTION 'Identity document upload is not open.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT operator.user_id INTO owner_id
  FROM public.accommodation_properties property
  JOIN public.accommodation_operators operator
    ON operator.id = property.operator_id
  WHERE property.id = NEW.property_id;

  segments := storage.foldername(NEW.storage_path);

  IF owner_id IS NULL
     OR cardinality(segments) <> 4
     OR lower(segments[1]) IS DISTINCT FROM lower(owner_id::text)
     OR segments[3] IS DISTINCT FROM NEW.evidence_type THEN
    RAISE EXCEPTION 'Evidence path is not allowed.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.guard_evidence() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS accommodation_evidence_guard ON public.accommodation_evidence;
CREATE TRIGGER accommodation_evidence_guard
  BEFORE INSERT OR UPDATE ON public.accommodation_evidence
  FOR EACH ROW EXECUTE FUNCTION havkar_private.guard_evidence();

CREATE OR REPLACE FUNCTION havkar_private.create_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accommodation_listings (property_id, title, publication_status)
  VALUES (NEW.id, NEW.display_name, 'draft');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accommodation_properties_listing ON public.accommodation_properties;
CREATE TRIGGER accommodation_properties_listing
  AFTER INSERT ON public.accommodation_properties
  FOR EACH ROW EXECUTE FUNCTION havkar_private.create_listing();

CREATE OR REPLACE FUNCTION havkar_private.guard_listing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  identity_status text;
  property_status text;
  country_open boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.publication_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'A listing starts unpublished.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.publication_status = 'published' OR NEW.published_at IS NOT NULL THEN
    SELECT operator.identity_status, property.property_status, rule.publish_enabled
      INTO identity_status, property_status, country_open
    FROM public.accommodation_properties property
    JOIN public.accommodation_operators operator
      ON operator.id = property.operator_id
    LEFT JOIN public.accommodation_addresses address
      ON address.property_id = property.id
    LEFT JOIN public.accommodation_country_rules rule
      ON rule.country_code = address.country_code
    WHERE property.id = NEW.property_id;

    IF identity_status IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION 'Publication requires a verified identity.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF property_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Publication requires a verified property.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF country_open IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Publication is not open for this country.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.publication_status IS DISTINCT FROM OLD.publication_status
     AND current_user IS DISTINCT FROM (
      SELECT pg_catalog.pg_get_userbyid(proc.proowner)
      FROM pg_catalog.pg_proc proc
      JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid = proc.pronamespace
      WHERE proc.proname = 'publish_accommodation_listing'
        AND namespace.nspname = 'public'
    ) THEN
    RAISE EXCEPTION 'Publication status cannot be changed from the client.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accommodation_listings_guard ON public.accommodation_listings;
CREATE TRIGGER accommodation_listings_guard
  BEFORE INSERT OR UPDATE ON public.accommodation_listings
  FOR EACH ROW EXECUTE FUNCTION havkar_private.guard_listing();

CREATE TRIGGER accommodation_listings_touch
  BEFORE UPDATE ON public.accommodation_listings
  FOR EACH ROW EXECUTE FUNCTION havkar_private.touch_updated_at();

CREATE OR REPLACE FUNCTION public.decide_accommodation_review(
  p_actor uuid,
  p_property_id uuid,
  p_decision text,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  next_status text;
BEGIN
  IF p_decision IN ('verified', 'identity_verified', 'publish')
     OR p_decision NOT IN ('needs_more_info', 'rejected', 'approved', 'suspended', 'revoked') THEN
    RAISE EXCEPTION 'This decision is not available.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_reviewers
    WHERE user_id = p_actor AND active
  ) THEN
    RAISE EXCEPTION 'Reviewer access is required.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT operator.user_id
    INTO owner_id
  FROM public.accommodation_properties property
  JOIN public.accommodation_operators operator
    ON operator.id = property.operator_id
  WHERE property.id = p_property_id;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Property not found.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF owner_id = p_actor THEN
    RAISE EXCEPTION 'A reviewer cannot decide their own property.'
      USING ERRCODE = 'check_violation';
  END IF;

  next_status := CASE p_decision
    WHEN 'needs_more_info' THEN 'needs_more_info'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'approved' THEN 'approved'
    WHEN 'suspended' THEN 'suspended'
    WHEN 'revoked' THEN 'revoked'
  END;

  PERFORM set_config('havkar.property_decision', 'allow', true);

  UPDATE public.accommodation_properties
  SET property_status = next_status
  WHERE id = p_property_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property status was not updated.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.accommodation_reviews (property_id, reviewer_id, decision, notes)
  VALUES (p_property_id, p_actor, p_decision, NULLIF(btrim(COALESCE(p_notes, '')), ''));

  INSERT INTO public.accommodation_audit_events (actor_id, action, entity_name, entity_id)
  VALUES (p_actor, 'property_' || p_decision, 'accommodation_properties', p_property_id);
END;
$$;

REVOKE ALL ON FUNCTION public.decide_accommodation_review(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_accommodation_review(uuid, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.publish_accommodation_listing(
  p_actor uuid,
  p_listing_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_reviewers
    WHERE user_id = p_actor AND active
  ) THEN
    RAISE EXCEPTION 'Reviewer access is required.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.accommodation_listings
  SET publication_status = 'published',
      published_at = now()
  WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found.'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_accommodation_listing(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_accommodation_listing(uuid, uuid)
  TO service_role;

ALTER TABLE public.accommodation_country_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_identity_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_listing_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.accommodation_country_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_operators FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_identity_checks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_properties FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_addresses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_listings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_listing_photos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_reviewers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_plans FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION havkar_private.listing_is_public(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accommodation_listings listing
    JOIN public.accommodation_properties property
      ON property.id = listing.property_id
    JOIN public.accommodation_operators operator
      ON operator.id = property.operator_id
    JOIN public.accommodation_addresses address
      ON address.property_id = property.id
    JOIN public.accommodation_country_rules rule
      ON rule.country_code = address.country_code
    WHERE listing.property_id = p_property_id
      AND listing.publication_status = 'published'
      AND property.property_status = 'approved'
      AND operator.identity_status = 'verified'
      AND rule.publish_enabled
  );
$$;

REVOKE ALL ON FUNCTION havkar_private.listing_is_public(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.listing_is_public(uuid) TO anon, authenticated;
GRANT USAGE ON SCHEMA havkar_private TO anon, authenticated;

GRANT SELECT ON public.accommodation_country_rules TO anon, authenticated;
GRANT SELECT ON public.accommodation_plans TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.accommodation_operators TO authenticated;
GRANT SELECT ON public.accommodation_identity_checks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accommodation_properties TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accommodation_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accommodation_credentials TO authenticated;
GRANT SELECT, INSERT ON public.accommodation_evidence TO authenticated;
GRANT SELECT ON public.accommodation_reviews TO authenticated;
GRANT SELECT, UPDATE ON public.accommodation_listings TO authenticated;
GRANT SELECT, INSERT ON public.accommodation_listing_photos TO authenticated;
GRANT SELECT, INSERT ON public.accommodation_reports TO authenticated;
GRANT SELECT ON public.accommodation_reviewers TO authenticated;

GRANT SELECT ON public.accommodation_listings TO anon;
GRANT SELECT ON public.accommodation_properties TO anon;
GRANT SELECT ON public.accommodation_addresses TO anon;
GRANT SELECT ON public.accommodation_credentials TO anon;

CREATE POLICY accommodation_rules_read
  ON public.accommodation_country_rules
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY accommodation_plans_read
  ON public.accommodation_plans
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY accommodation_operators_select_own
  ON public.accommodation_operators
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR EXISTS (
    SELECT 1 FROM public.accommodation_reviewers reviewer
    WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
  ));

CREATE POLICY accommodation_operators_insert_own
  ON public.accommodation_operators
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND identity_status = 'not_started');

CREATE POLICY accommodation_operators_update_own
  ON public.accommodation_operators
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id AND identity_status = 'not_started');

CREATE POLICY accommodation_identity_select
  ON public.accommodation_identity_checks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.accommodation_operators operator
    WHERE operator.id = operator_id
      AND (
        operator.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.accommodation_reviewers reviewer
          WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
        )
      )
  ));

CREATE POLICY accommodation_properties_select
  ON public.accommodation_properties
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.accommodation_operators operator
    WHERE operator.id = operator_id
      AND (
        operator.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.accommodation_reviewers reviewer
          WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
        )
      )
  ));

CREATE POLICY accommodation_properties_insert
  ON public.accommodation_properties
  FOR INSERT TO authenticated
  WITH CHECK (
    property_status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.accommodation_operators operator
      WHERE operator.id = operator_id
        AND operator.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY accommodation_properties_update
  ON public.accommodation_properties
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.accommodation_operators operator
    WHERE operator.id = operator_id
      AND operator.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.accommodation_operators operator
    WHERE operator.id = operator_id
      AND operator.user_id = (SELECT auth.uid())
  ));

CREATE POLICY accommodation_addresses_owner
  ON public.accommodation_addresses
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.accommodation_properties property
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE property.id = property_id
      AND (
        operator.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.accommodation_reviewers reviewer
          WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.accommodation_properties property
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE property.id = property_id
      AND operator.user_id = (SELECT auth.uid())
  ));

CREATE POLICY accommodation_credentials_owner
  ON public.accommodation_credentials
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.accommodation_properties property
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE property.id = property_id
      AND (
        operator.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.accommodation_reviewers reviewer
          WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.accommodation_properties property
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE property.id = property_id
      AND operator.user_id = (SELECT auth.uid())
  ));

CREATE POLICY accommodation_evidence_select
  ON public.accommodation_evidence
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.accommodation_properties property
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE property.id = property_id
      AND (
        operator.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.accommodation_reviewers reviewer
          WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
        )
      )
  ));

CREATE POLICY accommodation_evidence_insert
  ON public.accommodation_evidence
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.accommodation_properties property
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE property.id = property_id
      AND operator.user_id = (SELECT auth.uid())
      AND property.property_status IN ('draft', 'needs_more_info')
  ));

CREATE POLICY accommodation_reviews_select
  ON public.accommodation_reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator ON operator.id = property.operator_id
      WHERE property.id = property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY accommodation_listings_owner_select
  ON public.accommodation_listings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.accommodation_properties property
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE property.id = property_id
      AND (
        operator.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.accommodation_reviewers reviewer
          WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
        )
      )
  ));

CREATE POLICY accommodation_listings_owner_update
  ON public.accommodation_listings
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.accommodation_properties property
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE property.id = property_id
      AND operator.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (
    publication_status = 'draft'
    AND published_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator ON operator.id = property.operator_id
      WHERE property.id = property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY accommodation_public_listings
  ON public.accommodation_listings
  FOR SELECT TO anon, authenticated
  USING (havkar_private.listing_is_public(property_id));

CREATE POLICY accommodation_public_properties
  ON public.accommodation_properties
  FOR SELECT TO anon, authenticated
  USING (havkar_private.listing_is_public(id));

CREATE POLICY accommodation_public_addresses
  ON public.accommodation_addresses
  FOR SELECT TO anon, authenticated
  USING (havkar_private.listing_is_public(property_id));

CREATE POLICY accommodation_public_credentials
  ON public.accommodation_credentials
  FOR SELECT TO anon, authenticated
  USING (
    credential_type IN ('cin', 'regional_code')
    AND havkar_private.listing_is_public(property_id)
  );

CREATE POLICY accommodation_photos_owner
  ON public.accommodation_listing_photos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.accommodation_listings listing
    JOIN public.accommodation_properties property ON property.id = listing.property_id
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE listing.id = listing_id
      AND (
        operator.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.accommodation_reviewers reviewer
          WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
        )
      )
  ));

CREATE POLICY accommodation_photos_insert
  ON public.accommodation_listing_photos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.accommodation_listings listing
    JOIN public.accommodation_properties property ON property.id = listing.property_id
    JOIN public.accommodation_operators operator ON operator.id = property.operator_id
    WHERE listing.id = listing_id
      AND operator.user_id = (SELECT auth.uid())
      AND listing.publication_status = 'draft'
  ));

CREATE POLICY accommodation_reports_select_own
  ON public.accommodation_reports
  FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()) OR EXISTS (
    SELECT 1 FROM public.accommodation_reviewers reviewer
    WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
  ));

CREATE POLICY accommodation_reports_insert
  ON public.accommodation_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.accommodation_listings listing
      WHERE listing.id = listing_id
        AND havkar_private.listing_is_public(listing.property_id)
    )
  );

CREATE POLICY accommodation_reviewers_select_self
  ON public.accommodation_reviewers
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY accommodation_audit_reviewer
  ON public.accommodation_audit_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.accommodation_reviewers reviewer
    WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
  ));

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'accommodation-evidence',
  'accommodation-evidence',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
);

CREATE POLICY accommodation_evidence_storage_insert
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'accommodation-evidence'
    AND (SELECT auth.uid()) IS NOT NULL
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
    AND cardinality(storage.foldername(name)) = 4
    AND (storage.foldername(name))[3] IN (
      'ownership_record',
      'management_mandate',
      'cin_record',
      'regional_code',
      'local_permit',
      'exterior_photo',
      'safety_declaration'
    )
    AND name !~* '(^|/)identity(/|$)|passport|selfie'
  );

CREATE POLICY accommodation_evidence_storage_select_own
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'accommodation-evidence'
    AND (SELECT auth.uid()) IS NOT NULL
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  );

CREATE POLICY accommodation_evidence_storage_select_reviewer
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'accommodation-evidence'
    AND EXISTS (
      SELECT 1 FROM public.accommodation_reviewers reviewer
      WHERE reviewer.user_id = (SELECT auth.uid()) AND reviewer.active
    )
  );

REVOKE ALL ON FUNCTION havkar_private.block_identity_checks() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION havkar_private.create_identity_check() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION havkar_private.guard_property() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION havkar_private.create_listing() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION havkar_private.guard_listing() FROM PUBLIC, anon, authenticated, service_role;
