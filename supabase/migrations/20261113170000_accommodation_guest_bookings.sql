-- Guest booking ledger for HAVKAR direct accommodation inventory.
-- Public live booking remains gated by havkar_private.accommodation_booking_enabled()
-- (currently returns false). Unverified owners cannot receive payouts.

CREATE TABLE IF NOT EXISTS public.accommodation_guest_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text NOT NULL UNIQUE
    CHECK (char_length(btrim(booking_reference)) BETWEEN 8 AND 32),
  guest_user_id uuid NOT NULL REFERENCES auth.users (id),
  listing_id uuid NOT NULL REFERENCES public.accommodation_listings (id),
  property_id uuid NOT NULL REFERENCES public.accommodation_properties (id),
  provider text NOT NULL DEFAULT 'havkar_direct'
    CHECK (provider IN ('havkar_direct', 'duffel_stays')),
  check_in date NOT NULL,
  check_out date NOT NULL,
  adults integer NOT NULL DEFAULT 2 CHECK (adults BETWEEN 1 AND 20),
  children integer NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 20),
  rooms integer NOT NULL DEFAULT 1 CHECK (rooms BETWEEN 1 AND 10),
  currency char(3) NOT NULL DEFAULT 'EUR',
  list_price_cents integer CHECK (
    list_price_cents IS NULL OR list_price_cents >= 0
  ),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  fee_cents integer NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  total_cents integer CHECK (total_cents IS NULL OR total_cents >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'quote_held',
      'awaiting_payment',
      'paid_pending_supplier',
      'confirmed',
      'cancelled',
      'refunded',
      'failed'
    )),
  payment_method text
    CHECK (
      payment_method IS NULL
      OR payment_method IN ('stripe', 'xlm', 'none')
    ),
  payment_intent_id text,
  stripe_refund_id text,
  xlm_tx_hash text,
  cancellation_policy text,
  guest_notes text CHECK (guest_notes IS NULL OR char_length(guest_notes) <= 2000),
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_guest_booking_dates CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS accommodation_guest_bookings_guest_idx
  ON public.accommodation_guest_bookings (guest_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS accommodation_guest_bookings_property_idx
  ON public.accommodation_guest_bookings (property_id, status);

ALTER TABLE public.accommodation_guest_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_guest_bookings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accommodation_guest_bookings_guest_select
  ON public.accommodation_guest_bookings;
CREATE POLICY accommodation_guest_bookings_guest_select
  ON public.accommodation_guest_bookings
  FOR SELECT TO authenticated
  USING (guest_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS accommodation_guest_bookings_owner_select
  ON public.accommodation_guest_bookings;
CREATE POLICY accommodation_guest_bookings_owner_select
  ON public.accommodation_guest_bookings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.accommodation_properties property
      JOIN public.accommodation_operators operator
        ON operator.id = property.operator_id
      WHERE property.id = accommodation_guest_bookings.property_id
        AND operator.user_id = (SELECT auth.uid())
    )
  );

-- Guests/owners never insert/update bookings directly; service role API only.
REVOKE ALL ON TABLE public.accommodation_guest_bookings FROM anon;
GRANT SELECT ON TABLE public.accommodation_guest_bookings TO authenticated;
GRANT ALL ON TABLE public.accommodation_guest_bookings TO service_role;

CREATE TABLE IF NOT EXISTS public.accommodation_booking_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.accommodation_guest_bookings (id) ON DELETE SET NULL,
  actor_id uuid,
  action text NOT NULL CHECK (char_length(action) BETWEEN 2 AND 80),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accommodation_booking_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_booking_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accommodation_booking_audit_admin
  ON public.accommodation_booking_audit;
CREATE POLICY accommodation_booking_audit_admin
  ON public.accommodation_booking_audit
  FOR SELECT TO authenticated
  USING (public.havkar_session_is_admin());

REVOKE ALL ON TABLE public.accommodation_booking_audit FROM anon;
GRANT SELECT ON TABLE public.accommodation_booking_audit TO authenticated;
GRANT ALL ON TABLE public.accommodation_booking_audit TO service_role;
