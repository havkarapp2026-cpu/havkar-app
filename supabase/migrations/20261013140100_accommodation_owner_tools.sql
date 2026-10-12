-- Owner tools for accommodation.
-- This file is not applied to production by the repository itself.
--
-- Photos, availability, and draft prices stay private.
-- Nothing here publishes a listing, verifies an identity,
-- accepts a stay, or charges a payment.

CREATE SCHEMA IF NOT EXISTS havkar_private;

GRANT USAGE ON SCHEMA havkar_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

REVOKE ALL ON FUNCTION havkar_private.caller_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION havkar_private.caller_is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.havkar_session_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT havkar_private.caller_is_admin();
$$;

REVOKE ALL ON FUNCTION public.havkar_session_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.havkar_session_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION havkar_private.accommodation_booking_enabled()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT false;
$$;

REVOKE ALL ON FUNCTION havkar_private.accommodation_booking_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION havkar_private.accommodation_booking_enabled() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.havkar_accommodation_booking_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT havkar_private.accommodation_booking_enabled();
$$;

REVOKE ALL ON FUNCTION public.havkar_accommodation_booking_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.havkar_accommodation_booking_enabled() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.accommodation_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.accommodation_properties (id) ON DELETE CASCADE,
  stay_date date NOT NULL,
  state text NOT NULL CHECK (state IN ('open', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, stay_date)
);

CREATE TABLE IF NOT EXISTS public.accommodation_price_drafts (
  property_id uuid PRIMARY KEY REFERENCES public.accommodation_properties (id) ON DELETE CASCADE,
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  nightly_amount_cents integer,
  charge_status text NOT NULL DEFAULT 'not_charged',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_price_draft_amount_check CHECK (
    nightly_amount_cents IS NULL
    OR (nightly_amount_cents >= 0 AND nightly_amount_cents <= 100000000)
  ),
  CONSTRAINT accommodation_price_draft_not_charged CHECK (charge_status = 'not_charged')
);

CREATE TABLE IF NOT EXISTS public.accommodation_owner_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.accommodation_properties (id) ON DELETE CASCADE,
  storage_path text NOT NULL CHECK (
    char_length(storage_path) BETWEEN 8 AND 400
    AND storage_path !~* 'identity|passport|selfie'
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accommodation_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_availability FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_price_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_price_drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_owner_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_owner_photos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accommodation_availability_owner ON public.accommodation_availability;
CREATE POLICY accommodation_availability_owner
  ON public.accommodation_availability
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE property.id = accommodation_availability.property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE property.id = accommodation_availability.property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS accommodation_availability_admin_select ON public.accommodation_availability;
CREATE POLICY accommodation_availability_admin_select
  ON public.accommodation_availability
  FOR SELECT TO authenticated
  USING (havkar_private.caller_is_admin());

DROP POLICY IF EXISTS accommodation_price_draft_owner ON public.accommodation_price_drafts;
CREATE POLICY accommodation_price_draft_owner
  ON public.accommodation_price_drafts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE property.id = accommodation_price_drafts.property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE property.id = accommodation_price_drafts.property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS accommodation_price_draft_admin_select ON public.accommodation_price_drafts;
CREATE POLICY accommodation_price_draft_admin_select
  ON public.accommodation_price_drafts
  FOR SELECT TO authenticated
  USING (havkar_private.caller_is_admin());

DROP POLICY IF EXISTS accommodation_owner_photos_owner ON public.accommodation_owner_photos;
CREATE POLICY accommodation_owner_photos_owner
  ON public.accommodation_owner_photos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE property.id = accommodation_owner_photos.property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE property.id = accommodation_owner_photos.property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE
  public.accommodation_availability,
  public.accommodation_price_drafts,
  public.accommodation_owner_photos
FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.accommodation_availability,
  public.accommodation_price_drafts,
  public.accommodation_owner_photos
TO authenticated;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'accommodation-owner',
  'accommodation-owner',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS accommodation_owner_storage_insert ON storage.objects;
CREATE POLICY accommodation_owner_storage_insert
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'accommodation-owner'
    AND (SELECT auth.uid()) IS NOT NULL
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
    AND cardinality(storage.foldername(name)) = 4
    AND (storage.foldername(name))[3] = 'photo'
    AND name !~* 'identity|passport|selfie'
    AND EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE operator.user_id = (SELECT auth.uid())
        AND property.id::text = (storage.foldername(name))[2]
    )
  );

DROP POLICY IF EXISTS accommodation_owner_storage_select ON storage.objects;
CREATE POLICY accommodation_owner_storage_select
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'accommodation-owner'
    AND (SELECT auth.uid()) IS NOT NULL
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  );
