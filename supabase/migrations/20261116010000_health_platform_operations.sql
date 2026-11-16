-- HAVKAR Health Platform operations layer.
-- Safe additive DDL only. No destructive changes to reviews or payments.

CREATE TABLE IF NOT EXISTS public.health_availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.health_providers(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  modality text NOT NULL DEFAULT 'in_person'
    CHECK (modality IN ('in_person', 'message')),
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_availability_time_chk CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS health_availability_provider_slot_uidx
  ON public.health_availability_slots (provider_id, starts_at);

CREATE TABLE IF NOT EXISTS public.health_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.health_providers(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  consent_acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_messages_thread_idx
  ON public.health_messages (provider_id, patient_user_id, created_at);

CREATE TABLE IF NOT EXISTS public.health_license_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.health_providers(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.health_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.health_providers(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.health_appointments(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text CHECK (review_text IS NULL OR char_length(review_text) <= 2000),
  verified_visit boolean NOT NULL DEFAULT false,
  publication_status text NOT NULL DEFAULT 'published'
    CHECK (publication_status IN ('published', 'hidden', 'pending_moderation')),
  provider_reply text,
  provider_replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS health_reviews_one_per_appointment_uidx
  ON public.health_reviews (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS health_reviews_provider_idx
  ON public.health_reviews (provider_id, publication_status);

-- Existing legacy public.reviews table is intentionally untouched.

ALTER TABLE public.health_availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_license_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_slots_public_read_open" ON public.health_availability_slots;
CREATE POLICY "health_slots_public_read_open"
  ON public.health_availability_slots
  FOR SELECT
  TO anon, authenticated
  USING (
    is_open = true
    AND EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.publication_status = 'published'
    )
  );

DROP POLICY IF EXISTS "health_slots_owner_all" ON public.health_availability_slots;
CREATE POLICY "health_slots_owner_all"
  ON public.health_availability_slots
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "health_messages_participants_select" ON public.health_messages;
CREATE POLICY "health_messages_participants_select"
  ON public.health_messages
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = patient_user_id
    OR EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "health_messages_participants_insert" ON public.health_messages;
CREATE POLICY "health_messages_participants_insert"
  ON public.health_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = sender_user_id
    AND consent_acknowledged = true
    AND (
      (SELECT auth.uid()) = patient_user_id
      OR EXISTS (
        SELECT 1 FROM public.health_providers p
        WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "health_reviews_public_read" ON public.health_reviews;
CREATE POLICY "health_reviews_public_read"
  ON public.health_reviews
  FOR SELECT
  TO anon, authenticated
  USING (publication_status = 'published');

DROP POLICY IF EXISTS "health_reviews_patient_insert" ON public.health_reviews;
CREATE POLICY "health_reviews_patient_insert"
  ON public.health_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = patient_user_id);

DROP POLICY IF EXISTS "health_reviews_provider_reply" ON public.health_reviews;
CREATE POLICY "health_reviews_provider_reply"
  ON public.health_reviews
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "health_appointments_provider_select" ON public.health_appointments;
CREATE POLICY "health_appointments_provider_select"
  ON public.health_appointments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "health_appointments_provider_update" ON public.health_appointments;
CREATE POLICY "health_appointments_provider_update"
  ON public.health_appointments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.health_messages IS
  'Text-only patient/provider messages. Voice/video telehealth remains application-blocked.';
COMMENT ON TABLE public.health_reviews IS
  'Health-provider reviews separate from legacy public.reviews; no data migration/reset of legacy rows.';
