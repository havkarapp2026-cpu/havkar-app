-- HAVKAR jobs applications, private resumes, and listing guards.
-- Apply only to staging project keglioewbkgdabsizvys.
-- Do not apply to production project gispovnciifgikvgpzck.
-- This file does not update existing rows, take payment, or assign a role.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS country text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_status_allowed'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_status_allowed
      CHECK (
        status IS NULL
        OR status IN ('active', 'closed', 'pending_payment')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_category_allowed'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_category_allowed
      CHECK (
        category IS NULL
        OR category IN (
          'Hospitality',
          'Technology',
          'Health',
          'Education',
          'Construction',
          'Transport',
          'Retail',
          'Other'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_open_title_place
  ON public.jobs (
    user_id,
    lower(title),
    lower(COALESCE(city, '')),
    lower(COALESCE(country, ''))
  )
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.jobs_guard_customer_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  open_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.contact := NULL;
    IF current_user = 'authenticated' THEN
      IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'job owner mismatch'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'a new job is published without taking payment'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.city IS NULL
         OR char_length(btrim(NEW.city)) < 2
         OR char_length(NEW.city) > 80 THEN
        RAISE EXCEPTION 'city is required'
          USING ERRCODE = '23514';
      END IF;
      IF NEW.country IS NULL
         OR char_length(btrim(NEW.country)) < 2
         OR char_length(NEW.country) > 80 THEN
        RAISE EXCEPTION 'country is required'
          USING ERRCODE = '23514';
      END IF;
      IF NEW.category IS NULL OR NEW.category NOT IN (
        'Hospitality', 'Technology', 'Health', 'Education',
        'Construction', 'Transport', 'Retail', 'Other'
      ) THEN
        RAISE EXCEPTION 'category is required'
          USING ERRCODE = '23514';
      END IF;
      IF NEW.expires_at IS NULL
         OR NEW.expires_at <= pg_catalog.now()
         OR NEW.expires_at > pg_catalog.now() + interval '62 days' THEN
        RAISE EXCEPTION 'listing expiry must be within 60 days'
          USING ERRCODE = '23514';
      END IF;
      SELECT count(*)
        INTO open_count
      FROM public.jobs
      WHERE user_id = NEW.user_id
        AND status = 'active';
      IF open_count >= 8 THEN
        RAISE EXCEPTION 'active job limit reached'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'job identity cannot change'
        USING ERRCODE = '42501';
    END IF;
    NEW.contact := NULL;
    IF current_user = 'authenticated' THEN
      IF NEW.plan IS DISTINCT FROM OLD.plan
         OR NEW.monthly_fee IS DISTINCT FROM OLD.monthly_fee
         OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
        RAISE EXCEPTION 'plan and expiry cannot change here'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.status = 'pending_payment'
         AND NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status <> 'closed' THEN
        RAISE EXCEPTION 'unpaid listing cannot be activated from the client'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.status = 'closed' AND NEW.status IS DISTINCT FROM 'closed' THEN
        RAISE EXCEPTION 'a closed listing stays closed'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.status IS NULL OR NEW.status NOT IN ('active', 'closed', 'pending_payment') THEN
        RAISE EXCEPTION 'status is not allowed'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.status = 'active' AND (
        NEW.city IS NULL
        OR char_length(btrim(NEW.city)) < 2
        OR char_length(NEW.city) > 80
        OR NEW.country IS NULL
        OR char_length(btrim(NEW.country)) < 2
        OR char_length(NEW.country) > 80
        OR NEW.category IS NULL
        OR NEW.category NOT IN (
          'Hospitality', 'Technology', 'Health', 'Education',
          'Construction', 'Transport', 'Retail', 'Other'
        )
      ) THEN
        RAISE EXCEPTION 'city, country, and category are required'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.jobs_guard_customer_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jobs_guard_customer_write() TO authenticated;

DROP TRIGGER IF EXISTS jobs_guard_customer_write ON public.jobs;
CREATE TRIGGER jobs_guard_customer_write
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.jobs_guard_customer_write();

DROP POLICY IF EXISTS "Enable read access for all users" ON public.jobs;

DROP POLICY IF EXISTS jobs_select_open ON public.jobs;
CREATE POLICY jobs_select_open
  ON public.jobs
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND (expires_at IS NULL OR expires_at > pg_catalog.now())
  );

DROP POLICY IF EXISTS jobs_select_owner ON public.jobs;
CREATE POLICY jobs_select_owner
  ON public.jobs
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.jobs FROM anon;
GRANT SELECT ON TABLE public.jobs TO anon;
REVOKE ALL ON SEQUENCE public.jobs_id_seq FROM anon;

CREATE TABLE IF NOT EXISTS public.job_contacts (
  job_id bigint PRIMARY KEY REFERENCES public.jobs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  contact text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT job_contacts_length CHECK (char_length(contact) BETWEEN 3 AND 200),
  CONSTRAINT job_contacts_no_control CHECK (contact !~ '[[:cntrl:]]')
);

CREATE OR REPLACE FUNCTION public.job_contacts_guard_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  owner uuid;
BEGIN
  IF current_user <> 'authenticated' OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'contact stays with the employer'
      USING ERRCODE = '42501';
  END IF;
  SELECT j.user_id
    INTO owner
  FROM public.jobs AS j
  WHERE j.id = NEW.job_id;
  IF owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'contact stays with the employer'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.job_contacts_guard_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_contacts_guard_write() TO authenticated;

DROP TRIGGER IF EXISTS job_contacts_guard_write ON public.job_contacts;
CREATE TRIGGER job_contacts_guard_write
  BEFORE INSERT OR UPDATE ON public.job_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.job_contacts_guard_write();

ALTER TABLE public.job_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_contacts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_contacts_owner_select ON public.job_contacts;
CREATE POLICY job_contacts_owner_select
  ON public.job_contacts
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS job_contacts_owner_insert ON public.job_contacts;
CREATE POLICY job_contacts_owner_insert
  ON public.job_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS job_contacts_owner_update ON public.job_contacts;
CREATE POLICY job_contacts_owner_update
  ON public.job_contacts
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS job_contacts_owner_delete ON public.job_contacts;
CREATE POLICY job_contacts_owner_delete
  ON public.job_contacts
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.job_contacts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_contacts TO authenticated;

CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  cover_letter text,
  resume_path text,
  status text NOT NULL DEFAULT 'pending',
  conversation_id uuid REFERENCES public.conversations (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT job_applications_status_allowed CHECK (
    status IN ('pending', 'accepted', 'rejected', 'withdrawn')
  ),
  CONSTRAINT job_applications_cover_length CHECK (
    cover_letter IS NULL OR char_length(cover_letter) <= 2000
  ),
  CONSTRAINT job_applications_unique_applicant UNIQUE (job_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS job_applications_job_id_idx
  ON public.job_applications (job_id);

CREATE INDEX IF NOT EXISTS job_applications_applicant_created_idx
  ON public.job_applications (applicant_id, created_at);

CREATE OR REPLACE FUNCTION public.job_applications_guard_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  job_owner uuid;
  job_status text;
  job_expires timestamptz;
  recent_count integer;
  conversation_ok boolean;
  resume_pattern text;
BEGIN
  IF TG_OP = 'UPDATE' AND current_user <> 'authenticated' THEN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
  END IF;

  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'applications are submitted by signed-in members'
      USING ERRCODE = '42501';
  END IF;

  SELECT j.user_id, j.status, j.expires_at
    INTO job_owner, job_status, job_expires
  FROM public.jobs AS j
  WHERE j.id = NEW.job_id;

  IF job_owner IS NULL THEN
    RAISE EXCEPTION 'job is not available'
      USING ERRCODE = '42501';
  END IF;

  resume_pattern :=
    '^' || lower(NEW.applicant_id::text) || '/' || lower(NEW.id::text) || '\.(pdf|doc|docx)$';

  IF TG_OP = 'INSERT' THEN
    IF NEW.applicant_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'application owner mismatch'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.applicant_id = job_owner THEN
      RAISE EXCEPTION 'the employer cannot apply to their own job'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM 'pending' OR NEW.conversation_id IS NOT NULL THEN
      RAISE EXCEPTION 'a new application starts as pending'
        USING ERRCODE = '42501';
    END IF;
    IF job_status IS DISTINCT FROM 'active'
       OR (job_expires IS NOT NULL AND job_expires <= pg_catalog.now()) THEN
      RAISE EXCEPTION 'this job is not open for applications'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.resume_path IS NOT NULL AND NEW.resume_path !~ resume_pattern THEN
      RAISE EXCEPTION 'resume path is not allowed'
        USING ERRCODE = '42501';
    END IF;
    SELECT count(*)
      INTO recent_count
    FROM public.job_applications AS existing
    WHERE existing.applicant_id = NEW.applicant_id
      AND existing.created_at > pg_catalog.now() - interval '1 day';
    IF recent_count >= 5 THEN
      RAISE EXCEPTION 'application limit reached'
        USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.cover_letter IS DISTINCT FROM OLD.cover_letter THEN
    RAISE EXCEPTION 'application identity cannot change'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() = OLD.applicant_id THEN
    IF NEW.resume_path IS DISTINCT FROM OLD.resume_path AND (
      OLD.resume_path IS NOT NULL
      OR NEW.resume_path IS NULL
      OR NEW.resume_path !~ resume_pattern
    ) THEN
      RAISE EXCEPTION 'resume path is not allowed'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status = 'withdrawn') THEN
      RAISE EXCEPTION 'an applicant can only withdraw a pending application'
        USING ERRCODE = '42501';
    END IF;
  ELSIF auth.uid() = job_owner THEN
    IF NEW.resume_path IS DISTINCT FROM OLD.resume_path THEN
      RAISE EXCEPTION 'the employer cannot change the resume'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
         OLD.status = 'pending'
         AND NEW.status IN ('accepted', 'rejected')
       ) THEN
      RAISE EXCEPTION 'the employer can accept or reject a pending application'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'this application is not yours'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    IF OLD.conversation_id IS NOT NULL OR NEW.conversation_id IS NULL THEN
      RAISE EXCEPTION 'conversation cannot be replaced'
        USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM public.conversations AS thread
      WHERE thread.id = NEW.conversation_id
        AND thread.ad_id IS NULL
        AND (
          (thread.buyer_id = OLD.applicant_id AND thread.seller_id = job_owner)
          OR (thread.buyer_id = job_owner AND thread.seller_id = OLD.applicant_id)
        )
        AND (
          auth.uid() = thread.buyer_id
          OR auth.uid() = thread.seller_id
        )
    )
      INTO conversation_ok;
    IF NOT conversation_ok THEN
      RAISE EXCEPTION 'conversation does not belong to this application'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.job_applications_guard_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_applications_guard_write() TO authenticated;

DROP TRIGGER IF EXISTS job_applications_guard_write ON public.job_applications;
CREATE TRIGGER job_applications_guard_write
  BEFORE INSERT OR UPDATE ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.job_applications_guard_write();

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_applications_select_parties ON public.job_applications;
CREATE POLICY job_applications_select_parties
  ON public.job_applications
  FOR SELECT
  TO authenticated
  USING (
    applicant_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.jobs AS owned
      WHERE owned.id = job_applications.job_id
        AND owned.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS job_applications_insert_own ON public.job_applications;
CREATE POLICY job_applications_insert_own
  ON public.job_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    applicant_id = (SELECT auth.uid())
    AND status = 'pending'
    AND conversation_id IS NULL
  );

DROP POLICY IF EXISTS job_applications_update_parties ON public.job_applications;
CREATE POLICY job_applications_update_parties
  ON public.job_applications
  FOR UPDATE
  TO authenticated
  USING (
    applicant_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.jobs AS owned
      WHERE owned.id = job_applications.job_id
        AND owned.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    applicant_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.jobs AS owned
      WHERE owned.id = job_applications.job_id
        AND owned.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.job_applications FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.job_applications TO authenticated;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
SELECT
  'job-resumes',
  'job-resumes',
  false,
  5242880,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
WHERE NOT EXISTS (
  SELECT 1
  FROM storage.buckets
  WHERE id = 'job-resumes'
);

DROP POLICY IF EXISTS job_resumes_insert_own ON storage.objects;
CREATE POLICY job_resumes_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'job-resumes'
    AND (SELECT auth.uid()) IS NOT NULL
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
    AND cardinality(storage.foldername(name)) = 1
    AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|doc|docx)$'
  );

DROP POLICY IF EXISTS job_resumes_select_own ON storage.objects;
CREATE POLICY job_resumes_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job-resumes'
    AND (SELECT auth.uid()) IS NOT NULL
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
  );

DROP POLICY IF EXISTS job_resumes_delete_own ON storage.objects;
CREATE POLICY job_resumes_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'job-resumes'
    AND (SELECT auth.uid()) IS NOT NULL
    AND lower((storage.foldername(name))[1]) = lower((SELECT auth.uid())::text)
    AND cardinality(storage.foldername(name)) = 1
  );

DROP POLICY IF EXISTS job_resumes_select_employer ON storage.objects;
CREATE POLICY job_resumes_select_employer
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job-resumes'
    AND EXISTS (
      SELECT 1
      FROM public.job_applications AS application
      JOIN public.jobs AS job
        ON job.id = application.job_id
      WHERE job.user_id = (SELECT auth.uid())
        AND application.resume_path = name
    )
  );
