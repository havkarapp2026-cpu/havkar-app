-- HAVKAR Jobs + Services marketplace completion schema.
-- Additive only. Does not enable live payments or delete rows.
-- Safe to re-apply: IF NOT EXISTS / DROP POLICY IF EXISTS patterns.

-- Expanded job listing fields (optional workplace / employment metadata)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS work_mode text,
  ADD COLUMN IF NOT EXISTS workplace_lat double precision,
  ADD COLUMN IF NOT EXISTS workplace_lng double precision,
  ADD COLUMN IF NOT EXISTS vacancies integer,
  ADD COLUMN IF NOT EXISTS application_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS visa_sponsorship boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS relocation_assistance boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS languages_required text,
  ADD COLUMN IF NOT EXISTS contract_type text,
  ADD COLUMN IF NOT EXISTS benefits text,
  ADD COLUMN IF NOT EXISTS working_hours text,
  ADD COLUMN IF NOT EXISTS listing_state text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_work_mode_check' AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_work_mode_check
      CHECK (work_mode IS NULL OR work_mode = ANY (ARRAY['on_site','remote','hybrid']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_listing_state_check' AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_listing_state_check
      CHECK (
        listing_state IS NULL OR listing_state = ANY (ARRAY[
          'draft','preview','published','paused','expired','archived','pending_payment'
        ])
      );
  END IF;
END $$;

-- Job applications (applicant pipeline)
CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id bigint NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cover_letter text,
  resume_path text,
  status text NOT NULL DEFAULT 'submitted',
  conversation_id uuid,
  employer_notes text,
  interview_at timestamptz,
  applicant_consent_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_applications_status_check CHECK (
    status = ANY (ARRAY[
      'submitted','under_review','shortlisted','interview','rejected','hired','withdrawn'
    ])
  ),
  CONSTRAINT job_applications_cover_length CHECK (
    cover_letter IS NULL OR char_length(cover_letter) <= 5000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS job_applications_one_per_applicant
  ON public.job_applications (job_id, applicant_id);

CREATE INDEX IF NOT EXISTS job_applications_job_idx
  ON public.job_applications (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_applications_applicant_idx
  ON public.job_applications (applicant_id, created_at DESC);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_applications_select_own ON public.job_applications;
CREATE POLICY job_applications_select_own
  ON public.job_applications
  FOR SELECT
  TO authenticated
  USING (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS job_applications_insert_own ON public.job_applications;
CREATE POLICY job_applications_insert_own
  ON public.job_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (applicant_id = auth.uid());

DROP POLICY IF EXISTS job_applications_update_parties ON public.job_applications;
CREATE POLICY job_applications_update_parties
  ON public.job_applications
  FOR UPDATE
  TO authenticated
  USING (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  )
  WITH CHECK (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

-- Service provider portfolio extras (only when table already exists)
DO $$
BEGIN
  IF to_regclass('public.service_provider_profiles') IS NOT NULL THEN
    ALTER TABLE public.service_provider_profiles
      ADD COLUMN IF NOT EXISTS credentials text,
      ADD COLUMN IF NOT EXISTS portfolio_url text,
      ADD COLUMN IF NOT EXISTS license_evidence_path text,
      ADD COLUMN IF NOT EXISTS service_modes text;
  END IF;
END $$;

COMMENT ON TABLE public.job_applications IS
  'HAVKAR Jobs applicant pipeline. Resumes stay in private storage paths. Does not grant paid entitlements.';
