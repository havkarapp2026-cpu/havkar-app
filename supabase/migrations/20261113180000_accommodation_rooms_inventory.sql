-- Room categories / inventory for HAVKAR direct properties.
-- Booking remains gated by havkar_private.accommodation_booking_enabled().

CREATE TABLE IF NOT EXISTS public.accommodation_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.accommodation_properties (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  category text NOT NULL DEFAULT 'standard'
    CHECK (category IN (
      'standard',
      'deluxe',
      'suite',
      'family',
      'dorm',
      'studio',
      'other'
    )),
  max_adults integer NOT NULL DEFAULT 2 CHECK (max_adults BETWEEN 1 AND 20),
  max_children integer NOT NULL DEFAULT 0 CHECK (max_children BETWEEN 0 AND 20),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 500),
  amenities text[] NOT NULL DEFAULT '{}'::text[],
  description text CHECK (description IS NULL OR char_length(description) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accommodation_rooms_property_idx
  ON public.accommodation_rooms (property_id);

ALTER TABLE public.accommodation_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_rooms FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accommodation_rooms_owner_all ON public.accommodation_rooms;
CREATE POLICY accommodation_rooms_owner_all
  ON public.accommodation_rooms
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE property.id = accommodation_rooms.property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE property.id = accommodation_rooms.property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.accommodation_rooms FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accommodation_rooms TO authenticated;
GRANT ALL ON TABLE public.accommodation_rooms TO service_role;
