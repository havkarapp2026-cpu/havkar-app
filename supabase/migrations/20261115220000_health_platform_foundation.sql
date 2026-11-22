-- HAVKAR Global Health Platform foundation.
-- Safe CREATE IF NOT EXISTS only. No destructive changes.
-- Live subscription charging stays application-gated OFF.

CREATE TABLE IF NOT EXISTS public.health_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  category_id text NOT NULL,
  provider_kind text NOT NULL CHECK (
    provider_kind IN (
      'doctor',
      'pharmacy',
      'facility',
      'diagnostics',
      'care',
      'herbal',
      'travel',
      'information'
    )
  ),
  specialties text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  country_code text,
  region text,
  city text,
  address text,
  latitude double precision,
  longitude double precision,
  license_number text,
  license_jurisdiction text,
  license_status text NOT NULL DEFAULT 'unverified'
    CHECK (license_status IN ('unverified', 'pending', 'verified', 'rejected', 'suspended')),
  verification_notes text,
  bio text,
  website text,
  phone text,
  accepts_insurance boolean,
  accessibility_notes text,
  self_reported_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  publication_status text NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'pending_review', 'published', 'suspended')),
  regulated boolean NOT NULL DEFAULT true,
  subscription_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_providers_category_idx
  ON public.health_providers (category_id);
CREATE INDEX IF NOT EXISTS health_providers_city_idx
  ON public.health_providers (country_code, city);
CREATE INDEX IF NOT EXISTS health_providers_pub_idx
  ON public.health_providers (publication_status, license_status);
CREATE INDEX IF NOT EXISTS health_providers_user_idx
  ON public.health_providers (user_id);

CREATE TABLE IF NOT EXISTS public.health_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.health_providers(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'cancelled', 'completed', 'no_show')),
  modality text NOT NULL DEFAULT 'in_person'
    CHECK (modality IN ('in_person', 'message', 'voice', 'video')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_appointments_time_chk CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS health_appointments_provider_slot_uidx
  ON public.health_appointments (provider_id, starts_at)
  WHERE status IN ('requested', 'confirmed');

CREATE TABLE IF NOT EXISTS public.health_provider_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.health_providers(id) ON DELETE CASCADE,
  plan_id text NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'trialing', 'active', 'past_due', 'cancelled', 'blocked')),
  currency text NOT NULL DEFAULT 'eur',
  list_price_eur numeric(10,2),
  live_billing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_provider_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_providers_public_read_published" ON public.health_providers;
CREATE POLICY "health_providers_public_read_published"
  ON public.health_providers
  FOR SELECT
  TO anon, authenticated
  USING (
    publication_status = 'published'
    AND license_status IN ('verified', 'unverified')
  );

DROP POLICY IF EXISTS "health_providers_owner_select" ON public.health_providers;
CREATE POLICY "health_providers_owner_select"
  ON public.health_providers
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "health_providers_owner_insert" ON public.health_providers;
CREATE POLICY "health_providers_owner_insert"
  ON public.health_providers
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "health_providers_owner_update" ON public.health_providers;
CREATE POLICY "health_providers_owner_update"
  ON public.health_providers
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "health_appointments_patient_select" ON public.health_appointments;
CREATE POLICY "health_appointments_patient_select"
  ON public.health_appointments
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = patient_user_id);

DROP POLICY IF EXISTS "health_appointments_patient_insert" ON public.health_appointments;
CREATE POLICY "health_appointments_patient_insert"
  ON public.health_appointments
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = patient_user_id);

DROP POLICY IF EXISTS "health_subscriptions_owner_select" ON public.health_provider_subscriptions;
CREATE POLICY "health_subscriptions_owner_select"
  ON public.health_provider_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.health_providers p
      WHERE p.id = provider_id AND p.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.health_providers IS
  'HAVKAR health directory. Unverified providers must not be labeled as verified doctors/pharmacies.';
COMMENT ON COLUMN public.health_providers.self_reported_stats IS
  'Optional self-reported stats; never treat as independently verified outcomes.';
