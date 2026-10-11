-- HAVKAR services agreements, complaints, reviews, and booking security.
-- Prepared for owner review. This migration was not executed.
-- It does not delete service or booking rows.
-- It does not use the ad-images bucket.
-- service_review_public uses security_invoker and omits customer identity.
-- service_provider_public_stats is an intentional public projection.
-- security_invoker is not used on that stats view because anonymous users
-- must not receive booking-row access, and the view returns counts only.
-- It does not select phone numbers or Stripe account ids.

CREATE SCHEMA IF NOT EXISTS havkar_private;

REVOKE ALL ON SCHEMA havkar_private FROM PUBLIC;
GRANT USAGE ON SCHEMA havkar_private TO anon, authenticated, service_role;

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS agreed_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'unset',
  ADD COLUMN IF NOT EXISTS commission_bps integer,
  ADD COLUMN IF NOT EXISTS commission_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS completion_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cash_payment_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms text;

ALTER TABLE public.service_bookings
  DROP CONSTRAINT IF EXISTS service_bookings_payment_method_check;

ALTER TABLE public.service_bookings
  ADD CONSTRAINT service_bookings_payment_method_check
  CHECK (payment_method = ANY (ARRAY['unset'::text, 'online'::text, 'cash'::text]));

ALTER TABLE public.service_bookings
  DROP CONSTRAINT IF EXISTS service_bookings_commission_bps_check;

ALTER TABLE public.service_bookings
  ADD CONSTRAINT service_bookings_commission_bps_check
  CHECK (commission_bps IS NULL OR commission_bps = 1000);

ALTER TABLE public.service_bookings
  DROP CONSTRAINT IF EXISTS service_booking_status_check;

ALTER TABLE public.service_bookings
  ADD CONSTRAINT service_booking_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'price_proposed'::text,
    'accepted'::text,
    'declined'::text,
    'cancelled'::text,
    'completion_requested'::text,
    'completed'::text,
    'in_review'::text
  ]));

CREATE OR REPLACE FUNCTION havkar_private.enforce_service_booking_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  service_provider uuid;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'UPDATE'
       AND NEW.payment_method = 'cash'
       AND NEW.status IS DISTINCT FROM 'pending'
       AND NEW.status IS DISTINCT FROM 'cancelled'
       AND NEW.status IS DISTINCT FROM 'declined' THEN
      RAISE EXCEPTION 'cash bookings are not activated'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT provider_id
      INTO service_provider
    FROM public.services
    WHERE id = NEW.service_id
      AND status = 'active';

    IF service_provider IS NULL OR NEW.provider_id IS DISTINCT FROM service_provider THEN
      RAISE EXCEPTION 'booking provider does not match the service provider'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.customer_id IS DISTINCT FROM auth.uid()
       OR NEW.status IS DISTINCT FROM 'pending'
       OR NEW.payment_method = 'cash'
       OR NEW.commission_bps IS NOT NULL
       OR NEW.commission_amount IS NOT NULL
       OR NEW.completion_confirmed_at IS NOT NULL
       OR NEW.cash_payment_acknowledged_at IS NOT NULL THEN
      RAISE EXCEPTION 'booking insert is outside the allowed request'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.service_id IS DISTINCT FROM OLD.service_id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.commission_bps IS DISTINCT FROM OLD.commission_bps
       OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
       OR NEW.completion_confirmed_at IS DISTINCT FROM OLD.completion_confirmed_at
       OR NEW.cash_payment_acknowledged_at IS DISTINCT FROM OLD.cash_payment_acknowledged_at THEN
      RAISE EXCEPTION 'booking identity and settlement fields are locked'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.payment_method = 'cash' OR OLD.payment_method = 'cash' THEN
      RAISE EXCEPTION 'cash bookings are not activated'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF auth.uid() = OLD.provider_id THEN
        IF NOT (
          (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined', 'price_proposed'))
          OR (OLD.status = 'price_proposed' AND NEW.status IN ('accepted', 'declined'))
        ) THEN
          RAISE EXCEPTION 'provider booking transition is not allowed'
            USING ERRCODE = '42501';
        END IF;
        IF NEW.status IN ('accepted', 'completion_requested')
           AND OLD.payment_method IS DISTINCT FROM 'online'
           AND NEW.payment_method IS DISTINCT FROM 'online' THEN
          RAISE EXCEPTION 'provider acceptance requires an online payment method'
            USING ERRCODE = '42501';
        END IF;
      ELSIF auth.uid() = OLD.customer_id THEN
        IF NOT (
          NEW.status = 'cancelled'
          AND OLD.status IN ('pending', 'price_proposed', 'accepted')
        ) THEN
          RAISE EXCEPTION 'customer booking transition is not allowed'
            USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'booking update is not allowed'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.enforce_service_booking_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_bookings_enforce_write ON public.service_bookings;
CREATE TRIGGER service_bookings_enforce_write
  BEFORE INSERT OR UPDATE ON public.service_bookings
  FOR EACH ROW
  EXECUTE FUNCTION havkar_private.enforce_service_booking_write();

DROP POLICY IF EXISTS "Customers can create bookings" ON public.service_bookings;
DROP POLICY IF EXISTS "Providers can update received bookings" ON public.service_bookings;
DROP POLICY IF EXISTS "Customers can cancel own bookings" ON public.service_bookings;

CREATE POLICY "Customers can create bookings for the real provider"
ON public.service_bookings
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id = (SELECT auth.uid())
  AND provider_id <> (SELECT auth.uid())
  AND status = 'pending'
  AND payment_method IN ('unset', 'online')
  AND EXISTS (
    SELECT 1
    FROM public.services service
    WHERE service.id = service_bookings.service_id
      AND service.provider_id = service_bookings.provider_id
      AND service.status = 'active'
  )
);

CREATE POLICY "Booking parties can update allowed states"
ON public.service_bookings
FOR UPDATE
TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  OR provider_id = (SELECT auth.uid())
)
WITH CHECK (
  customer_id = (SELECT auth.uid())
  OR provider_id = (SELECT auth.uid())
);

REVOKE ALL ON TABLE public.service_bookings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_bookings TO authenticated;
GRANT ALL ON TABLE public.service_bookings TO service_role;

REVOKE ALL ON SEQUENCE public.service_bookings_id_seq FROM PUBLIC, anon;
GRANT USAGE, SELECT ON SEQUENCE public.service_bookings_id_seq TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.service_agreements (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL UNIQUE REFERENCES public.service_bookings(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1,
  description text NOT NULL,
  scope text NOT NULL,
  price numeric(12,2) NOT NULL,
  currency text NOT NULL,
  appointment_date date,
  appointment_time time without time zone,
  payment_method text NOT NULL,
  cancellation_terms text NOT NULL DEFAULT '',
  customer_accepted_at timestamptz,
  provider_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_agreements_payment_method_check CHECK (payment_method = 'online')
);

CREATE TABLE IF NOT EXISTS public.service_agreement_revisions (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  agreement_id bigint NOT NULL REFERENCES public.service_agreements(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  proposed_by uuid NOT NULL,
  approved_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, version)
);

CREATE OR REPLACE FUNCTION havkar_private.enforce_service_agreement_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.customer_accepted_at IS NOT NULL AND OLD.provider_accepted_at IS NOT NULL THEN
    IF NEW.description IS DISTINCT FROM OLD.description
       OR NEW.scope IS DISTINCT FROM OLD.scope
       OR NEW.price IS DISTINCT FROM OLD.price
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
       OR NEW.appointment_time IS DISTINCT FROM OLD.appointment_time
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.cancellation_terms IS DISTINCT FROM OLD.cancellation_terms
       OR NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
      RAISE EXCEPTION 'an accepted service agreement cannot be rewritten in place'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.enforce_service_agreement_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_agreements_lock_accepted ON public.service_agreements;
CREATE TRIGGER service_agreements_lock_accepted
  BEFORE UPDATE ON public.service_agreements
  FOR EACH ROW
  EXECUTE FUNCTION havkar_private.enforce_service_agreement_write();

CREATE TABLE IF NOT EXISTS public.service_complaints (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES public.service_bookings(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL,
  category text NOT NULL,
  explanation text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_complaints_category_check CHECK (
    category = ANY (ARRAY[
      'service_not_completed'::text,
      'poor_service_quality'::text,
      'incorrect_price'::text,
      'payment_disagreement'::text,
      'provider_did_not_arrive'::text,
      'customer_did_not_pay'::text,
      'other'::text
    ])
  ),
  CONSTRAINT service_complaints_explanation_check CHECK (char_length(btrim(explanation)) BETWEEN 10 AND 4000),
  CONSTRAINT service_complaints_status_check CHECK (
    status = ANY (ARRAY['submitted'::text, 'awaiting_review'::text, 'resolved'::text, 'closed'::text])
  )
);

CREATE TABLE IF NOT EXISTS public.service_complaint_messages (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  complaint_id bigint NOT NULL REFERENCES public.service_complaints(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_complaint_messages_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000)
);

CREATE TABLE IF NOT EXISTS public.service_reviews (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL UNIQUE REFERENCES public.service_bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  rating smallint NOT NULL,
  review_text text NOT NULL,
  status text NOT NULL DEFAULT 'published',
  provider_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT service_reviews_text_check CHECK (char_length(btrim(review_text)) BETWEEN 5 AND 1000),
  CONSTRAINT service_reviews_not_self CHECK (customer_id <> provider_id),
  CONSTRAINT service_reviews_status_check CHECK (status = ANY (ARRAY['published'::text, 'hidden'::text, 'reported'::text]))
);

CREATE TABLE IF NOT EXISTS public.service_review_reports (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  review_id bigint NOT NULL REFERENCES public.service_reviews(id) ON DELETE RESTRICT,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_id),
  CONSTRAINT service_review_reports_reason_check CHECK (char_length(btrim(reason)) BETWEEN 5 AND 1000)
);

CREATE TABLE IF NOT EXISTS public.service_completion_codes (
  booking_id bigint PRIMARY KEY REFERENCES public.service_bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_booking_messages (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES public.service_bookings(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_booking_messages_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE TABLE IF NOT EXISTS public.service_provider_profiles (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL,
  avatar_url text,
  description text NOT NULL DEFAULT '',
  service_area text NOT NULL DEFAULT '',
  verification_status text NOT NULL DEFAULT 'unverified',
  stripe_account_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_provider_profiles_name_check CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 80),
  CONSTRAINT service_provider_profiles_verification_check CHECK (
    verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])
  )
);

CREATE OR REPLACE FUNCTION havkar_private.enforce_service_provider_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND NEW.verification_status IS DISTINCT FROM 'unverified' THEN
      RAISE EXCEPTION 'provider verification cannot be self-assigned'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      RAISE EXCEPTION 'provider verification cannot be self-assigned'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id THEN
      RAISE EXCEPTION 'provider payout account cannot be self-assigned'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.stripe_account_id IS NOT NULL THEN
      RAISE EXCEPTION 'provider payout account cannot be self-assigned'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.enforce_service_provider_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_provider_profiles_lock_verification ON public.service_provider_profiles;
CREATE TRIGGER service_provider_profiles_lock_verification
  BEFORE INSERT OR UPDATE ON public.service_provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION havkar_private.enforce_service_provider_profile();

CREATE OR REPLACE FUNCTION havkar_private.enforce_service_review_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  booking public.service_bookings;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO booking FROM public.service_bookings WHERE id = NEW.booking_id;
    IF booking.id IS NULL
       OR booking.customer_id IS DISTINCT FROM NEW.customer_id
       OR booking.provider_id IS DISTINCT FROM NEW.provider_id
       OR NEW.customer_id IS DISTINCT FROM auth.uid()
       OR booking.status NOT IN ('completed', 'in_review') THEN
      RAISE EXCEPTION 'service review is not tied to an eligible booking'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.review_text IS DISTINCT FROM OLD.review_text
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'a service review rating cannot be rewritten'
        USING ERRCODE = '42501';
    END IF;
    IF auth.uid() IS DISTINCT FROM OLD.provider_id THEN
      RAISE EXCEPTION 'only the provider may respond to a service review'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.enforce_service_review_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_reviews_lock_rating ON public.service_reviews;
CREATE TRIGGER service_reviews_lock_rating
  BEFORE INSERT OR UPDATE ON public.service_reviews
  FOR EACH ROW
  EXECUTE FUNCTION havkar_private.enforce_service_review_write();

CREATE OR REPLACE FUNCTION havkar_private.notify_service_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    recipient := NEW.provider_id;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    recipient := CASE
      WHEN auth.uid() = NEW.provider_id THEN NEW.customer_id
      ELSE NEW.provider_id
    END;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, action_url, reference_id)
  VALUES (
    recipient,
    'service',
    'Service booking update',
    'Booking ' || NEW.id::text || ' is now ' || NEW.status || '.',
    'services.html',
    NEW.id::text
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.notify_service_booking_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_bookings_notify ON public.service_bookings;
CREATE TRIGGER service_bookings_notify
  AFTER INSERT OR UPDATE OF status ON public.service_bookings
  FOR EACH ROW
  EXECUTE FUNCTION havkar_private.notify_service_booking_change();

ALTER TABLE public.service_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_agreement_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_complaint_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_review_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_completion_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_booking_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_provider_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_agreements_party_select
ON public.service_agreements FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_bookings booking
    WHERE booking.id = service_agreements.booking_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_agreements_party_insert
ON public.service_agreements FOR INSERT TO authenticated
WITH CHECK (
  payment_method = 'online'
  AND EXISTS (
    SELECT 1 FROM public.service_bookings booking
    WHERE booking.id = service_agreements.booking_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_agreements_party_update
ON public.service_agreements FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_bookings booking
    WHERE booking.id = service_agreements.booking_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.service_bookings booking
    WHERE booking.id = service_agreements.booking_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_agreement_revisions_party_select
ON public.service_agreement_revisions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_agreements agreement
    JOIN public.service_bookings booking ON booking.id = agreement.booking_id
    WHERE agreement.id = service_agreement_revisions.agreement_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_agreement_revisions_party_insert
ON public.service_agreement_revisions FOR INSERT TO authenticated
WITH CHECK (
  proposed_by <> approved_by
  AND (proposed_by = (SELECT auth.uid()) OR approved_by = (SELECT auth.uid()))
);

CREATE POLICY service_complaints_party_select
ON public.service_complaints FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_bookings booking
    WHERE booking.id = service_complaints.booking_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_complaints_party_insert
ON public.service_complaints FOR INSERT TO authenticated
WITH CHECK (
  author_id = (SELECT auth.uid())
  AND status = 'submitted'
  AND EXISTS (
    SELECT 1 FROM public.service_bookings booking
    WHERE booking.id = service_complaints.booking_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_complaint_messages_party_select
ON public.service_complaint_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_complaints complaint
    JOIN public.service_bookings booking ON booking.id = complaint.booking_id
    WHERE complaint.id = service_complaint_messages.complaint_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_complaint_messages_party_insert
ON public.service_complaint_messages FOR INSERT TO authenticated
WITH CHECK (
  author_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.service_complaints complaint
    JOIN public.service_bookings booking ON booking.id = complaint.booking_id
    WHERE complaint.id = service_complaint_messages.complaint_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_reviews_public_select
ON public.service_reviews FOR SELECT TO anon, authenticated
USING (status = 'published');

CREATE POLICY service_reviews_customer_insert
ON public.service_reviews FOR INSERT TO authenticated
WITH CHECK (
  customer_id = (SELECT auth.uid())
  AND status = 'published'
);

CREATE POLICY service_reviews_provider_update
ON public.service_reviews FOR UPDATE TO authenticated
USING (provider_id = (SELECT auth.uid()))
WITH CHECK (provider_id = (SELECT auth.uid()));

CREATE POLICY service_review_reports_insert
ON public.service_review_reports FOR INSERT TO authenticated
WITH CHECK (reporter_id = (SELECT auth.uid()));

CREATE POLICY service_review_reports_own_select
ON public.service_review_reports FOR SELECT TO authenticated
USING (reporter_id = (SELECT auth.uid()));

CREATE POLICY service_completion_codes_customer_select
ON public.service_completion_codes FOR SELECT TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  AND used_at IS NULL
  AND expires_at > now()
);

CREATE POLICY service_booking_messages_party
ON public.service_booking_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_bookings booking
    WHERE booking.id = service_booking_messages.booking_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_booking_messages_insert
ON public.service_booking_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.service_bookings booking
    WHERE booking.id = service_booking_messages.booking_id
      AND (booking.customer_id = (SELECT auth.uid()) OR booking.provider_id = (SELECT auth.uid()))
  )
);

CREATE POLICY service_provider_profiles_public_select
ON public.service_provider_profiles FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY service_provider_profiles_owner_write
ON public.service_provider_profiles FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND verification_status = 'unverified'
);

CREATE POLICY service_provider_profiles_owner_update
ON public.service_provider_profiles FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.service_agreements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_agreements TO authenticated;
GRANT ALL ON TABLE public.service_agreements TO service_role;

REVOKE ALL ON TABLE public.service_agreement_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.service_agreement_revisions TO authenticated;
GRANT ALL ON TABLE public.service_agreement_revisions TO service_role;

REVOKE ALL ON TABLE public.service_complaints FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.service_complaints TO authenticated;
GRANT ALL ON TABLE public.service_complaints TO service_role;

REVOKE ALL ON TABLE public.service_complaint_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.service_complaint_messages TO authenticated;
GRANT ALL ON TABLE public.service_complaint_messages TO service_role;

REVOKE ALL ON TABLE public.service_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  provider_id,
  rating,
  review_text,
  status,
  provider_response,
  created_at
) ON public.service_reviews TO anon, authenticated;
GRANT INSERT (
  booking_id,
  customer_id,
  provider_id,
  rating,
  review_text,
  status
) ON public.service_reviews TO authenticated;
GRANT UPDATE (provider_response) ON public.service_reviews TO authenticated;
GRANT ALL ON TABLE public.service_reviews TO service_role;

CREATE TABLE IF NOT EXISTS public.service_commission_entries (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL UNIQUE REFERENCES public.service_bookings(id) ON DELETE RESTRICT,
  agreed_amount_cents integer NOT NULL,
  currency text NOT NULL,
  customer_charge_cents integer NOT NULL,
  commission_bps integer NOT NULL,
  commission_cents integer NOT NULL,
  provider_settlement_cents integer NOT NULL,
  payer text NOT NULL,
  stripe_event_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_commission_entries_amount_check CHECK (agreed_amount_cents >= 0),
  CONSTRAINT service_commission_entries_bps_check CHECK (commission_bps = 1000),
  CONSTRAINT service_commission_entries_payer_check CHECK (payer = 'provider'),
  CONSTRAINT service_commission_entries_customer_check CHECK (customer_charge_cents = agreed_amount_cents),
  CONSTRAINT service_commission_entries_split_check CHECK (
    commission_cents >= 0
    AND provider_settlement_cents >= 0
    AND commission_cents + provider_settlement_cents = agreed_amount_cents
  )
);

CREATE OR REPLACE FUNCTION havkar_private.enforce_service_commission_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.commission_bps := 1000;
  NEW.payer := 'provider';
  NEW.customer_charge_cents := NEW.agreed_amount_cents;
  NEW.commission_cents := round(NEW.agreed_amount_cents * 1000 / 10000.0)::integer;
  NEW.provider_settlement_cents := NEW.agreed_amount_cents - NEW.commission_cents;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.enforce_service_commission_entry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_commission_entries_force_split ON public.service_commission_entries;
CREATE TRIGGER service_commission_entries_force_split
  BEFORE INSERT ON public.service_commission_entries
  FOR EACH ROW
  EXECUTE FUNCTION havkar_private.enforce_service_commission_entry();

ALTER TABLE public.service_commission_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_commission_entries_party_select
ON public.service_commission_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_bookings booking
    WHERE booking.id = service_commission_entries.booking_id
      AND (
        booking.customer_id = (SELECT auth.uid())
        OR booking.provider_id = (SELECT auth.uid())
      )
  )
);

REVOKE ALL ON TABLE public.service_commission_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_commission_entries TO authenticated;
GRANT ALL ON TABLE public.service_commission_entries TO service_role;

CREATE OR REPLACE VIEW public.service_review_public
WITH (security_invoker = true) AS
SELECT
  id,
  provider_id,
  rating,
  review_text,
  provider_response,
  created_at
FROM public.service_reviews
WHERE status = 'published';

REVOKE ALL ON TABLE public.service_review_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_review_public TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.service_review_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.service_review_reports TO authenticated;
GRANT ALL ON TABLE public.service_review_reports TO service_role;

REVOKE ALL ON TABLE public.service_completion_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT (booking_id, expires_at, used_at, attempts) ON public.service_completion_codes TO authenticated;
GRANT ALL ON TABLE public.service_completion_codes TO service_role;

REVOKE ALL ON TABLE public.service_booking_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.service_booking_messages TO authenticated;
GRANT ALL ON TABLE public.service_booking_messages TO service_role;

REVOKE ALL ON TABLE public.service_provider_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  user_id,
  display_name,
  avatar_url,
  description,
  service_area,
  verification_status,
  created_at,
  updated_at
) ON public.service_provider_profiles TO anon, authenticated;
GRANT INSERT (
  user_id,
  display_name,
  avatar_url,
  description,
  service_area
) ON public.service_provider_profiles TO authenticated;
GRANT UPDATE (
  display_name,
  avatar_url,
  description,
  service_area
) ON public.service_provider_profiles TO authenticated;
GRANT ALL ON TABLE public.service_provider_profiles TO service_role;

CREATE OR REPLACE VIEW public.service_provider_public_stats AS
SELECT
  profile.user_id AS provider_id,
  profile.display_name,
  profile.avatar_url,
  profile.description,
  profile.service_area,
  profile.verification_status,
  COALESCE(reviews.average_rating, 0) AS average_rating,
  COALESCE(reviews.review_count, 0) AS review_count,
  COALESCE(completed.completed_bookings, 0) AS completed_bookings
FROM public.service_provider_profiles profile
LEFT JOIN (
  SELECT provider_id,
         round(avg(rating)::numeric, 2) AS average_rating,
         count(*) AS review_count
  FROM public.service_reviews
  WHERE status = 'published'
  GROUP BY provider_id
) reviews ON reviews.provider_id = profile.user_id
LEFT JOIN (
  SELECT provider_id, count(*) AS completed_bookings
  FROM public.service_bookings
  WHERE status = 'completed'
  GROUP BY provider_id
) completed ON completed.provider_id = profile.user_id;

REVOKE ALL ON TABLE public.service_provider_public_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_provider_public_stats TO anon, authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-images',
  'service-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-dispute-evidence',
  'service-dispute-evidence',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY service_images_public_read
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'service-images');

CREATE POLICY service_images_owner_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'service-images'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY service_dispute_evidence_party_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'service-dispute-evidence'
  AND EXISTS (
    SELECT 1
    FROM public.service_complaints complaint
    JOIN public.service_bookings booking ON booking.id = complaint.booking_id
    WHERE complaint.id::text = (storage.foldername(name))[1]
      AND (
        booking.customer_id = (SELECT auth.uid())
        OR booking.provider_id = (SELECT auth.uid())
      )
  )
);

CREATE POLICY service_dispute_evidence_party_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'service-dispute-evidence'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1
    FROM public.service_complaints complaint
    JOIN public.service_bookings booking ON booking.id = complaint.booking_id
    WHERE complaint.id::text = (storage.foldername(name))[1]
      AND (
        booking.customer_id = (SELECT auth.uid())
        OR booking.provider_id = (SELECT auth.uid())
      )
  )
);
