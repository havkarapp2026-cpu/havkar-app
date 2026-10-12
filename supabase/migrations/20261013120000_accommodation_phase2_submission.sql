-- Accommodation phase 2: owner submission.
-- Does not verify identity, publish a listing, price a plan,
-- or open identity-document upload.

CREATE OR REPLACE FUNCTION havkar_private.caller_email_confirmed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION havkar_private.caller_email_confirmed() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.caller_email_confirmed() TO authenticated;

CREATE OR REPLACE FUNCTION havkar_private.guard_property()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  property_country char(2);
  address_city text;
  address_street text;
  address_number text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.property_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'A property starts as a draft.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' AND current_user = 'authenticated' THEN
    IF NOT havkar_private.caller_email_confirmed() THEN
      RAISE EXCEPTION 'A confirmed email is required.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND current_user = 'authenticated'
     AND current_setting('havkar.property_decision', true) IS DISTINCT FROM 'allow'
     AND OLD.property_status NOT IN ('draft', 'needs_more_info')
     AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'This application can no longer be changed.'
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
      IF NOT havkar_private.caller_email_confirmed() THEN
        RAISE EXCEPTION 'A confirmed email is required.'
          USING ERRCODE = 'check_violation';
      END IF;

      IF char_length(btrim(NEW.display_name)) < 2
         OR NEW.marketing_type NOT IN (
           'hotel', 'bnb', 'apartment', 'holiday_home', 'villa', 'guesthouse'
         )
         OR NEW.legal_category NOT IN (
           'hotel_structure', 'non_hotel_structure', 'short_let', 'tourist_lease'
         ) THEN
        RAISE EXCEPTION 'Property name, type, and legal category are required.'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT a.country_code, a.city, a.street, a.street_number
        INTO property_country, address_city, address_street, address_number
      FROM public.accommodation_addresses a
      WHERE a.property_id = NEW.id;

      IF property_country IS NULL
         OR char_length(btrim(coalesce(address_city, ''))) < 1
         OR char_length(btrim(coalesce(address_street, ''))) < 1
         OR char_length(btrim(coalesce(address_number, ''))) < 1 THEN
        RAISE EXCEPTION 'City, street, and building number are required.'
          USING ERRCODE = 'check_violation';
      END IF;

      IF NOT EXISTS (
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

REVOKE ALL ON FUNCTION havkar_private.guard_property() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.guard_owner_file_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_property uuid;
  status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_property := OLD.property_id;
  ELSE
    target_property := NEW.property_id;
  END IF;

  SELECT property.property_status INTO status
  FROM public.accommodation_properties property
  WHERE property.id = target_property;

  IF current_user = 'authenticated'
     AND status IS NOT NULL
     AND status NOT IN ('draft', 'needs_more_info') THEN
    RAISE EXCEPTION 'This application can no longer be changed.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.guard_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_property uuid;
  status text;
BEGIN
  IF TG_OP <> 'DELETE'
     AND NEW.country_code = 'IT'
     AND char_length(btrim(coalesce(NEW.street_number, ''))) < 1 THEN
    RAISE EXCEPTION 'Building number is required.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_property := OLD.property_id;
  ELSE
    target_property := NEW.property_id;
  END IF;

  SELECT property.property_status INTO status
  FROM public.accommodation_properties property
  WHERE property.id = target_property;

  IF current_user = 'authenticated'
     AND status IS NOT NULL
     AND status NOT IN ('draft', 'needs_more_info') THEN
    RAISE EXCEPTION 'This application can no longer be changed.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.guard_owner_file_edit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION havkar_private.guard_address() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS accommodation_addresses_owner_lock ON public.accommodation_addresses;
CREATE TRIGGER accommodation_addresses_owner_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.accommodation_addresses
  FOR EACH ROW EXECUTE FUNCTION havkar_private.guard_address();

DROP TRIGGER IF EXISTS accommodation_credentials_owner_lock ON public.accommodation_credentials;
CREATE TRIGGER accommodation_credentials_owner_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.accommodation_credentials
  FOR EACH ROW EXECUTE FUNCTION havkar_private.guard_owner_file_edit();

ALTER TABLE public.accommodation_addresses
  DROP CONSTRAINT IF EXISTS accommodation_building_number_shape;

ALTER TABLE public.accommodation_addresses
  ADD CONSTRAINT accommodation_building_number_shape
  CHECK (
    street_number IS NULL
    OR char_length(btrim(street_number)) BETWEEN 1 AND 20
  );

REVOKE SELECT ON public.accommodation_credentials FROM anon;

DROP POLICY IF EXISTS accommodation_public_credentials ON public.accommodation_credentials;

CREATE POLICY accommodation_public_credentials
  ON public.accommodation_credentials
  FOR SELECT TO authenticated
  USING (
    credential_type = 'local_permit'
    AND havkar_private.listing_is_public(property_id)
  );
