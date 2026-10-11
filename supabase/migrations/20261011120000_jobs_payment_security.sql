-- HAVKAR jobs payment and visibility security.
-- Prepared for owner review. This migration was not executed.
-- It does not delete job rows.

CREATE SCHEMA IF NOT EXISTS havkar_private;

REVOKE ALL ON SCHEMA havkar_private FROM PUBLIC;
GRANT USAGE ON SCHEMA havkar_private TO anon, authenticated, service_role;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS positions_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS employer_kind text NOT NULL DEFAULT 'ordinary',
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

ALTER TABLE public.jobs
  ALTER COLUMN status SET DEFAULT 'pending_payment';

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_positions_count_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_positions_count_check
  CHECK (positions_count >= 1 AND positions_count <= 100000);

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_employer_kind_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_employer_kind_check
  CHECK (employer_kind = ANY (ARRAY['ordinary'::text, 'company'::text]));

CREATE TABLE IF NOT EXISTS public.job_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  legal_name text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_companies_legal_name_check CHECK (char_length(btrim(legal_name)) BETWEEN 2 AND 160),
  CONSTRAINT job_companies_verification_check CHECK (
    verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])
  )
);

CREATE TABLE IF NOT EXISTS public.job_company_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.job_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_company_branches_name_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  CONSTRAINT job_company_branches_verification_check CHECK (
    verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])
  )
);

CREATE TABLE IF NOT EXISTS public.job_company_members (
  company_id uuid NOT NULL REFERENCES public.job_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  branch_id uuid REFERENCES public.job_company_branches(id) ON DELETE CASCADE,
  member_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id),
  CONSTRAINT job_company_members_role_check CHECK (member_role = ANY (ARRAY['owner'::text, 'branch_manager'::text]))
);

CREATE TABLE IF NOT EXISTS public.job_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.job_companies(id) ON DELETE RESTRICT,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  plan_code text,
  status text NOT NULL DEFAULT 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  active_advertisement_limit integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_subscriptions_status_check CHECK (
    status = ANY (ARRAY[
      'incomplete'::text,
      'incomplete_expired'::text,
      'trialing'::text,
      'active'::text,
      'past_due'::text,
      'canceled'::text,
      'unpaid'::text,
      'paused'::text,
      'needs_review'::text
    ])
  ),
  CONSTRAINT job_subscriptions_plan_check CHECK (
    plan_code IS NULL OR plan_code = ANY (ARRAY['business'::text, 'business_plus'::text, 'enterprise'::text])
  )
);

CREATE TABLE IF NOT EXISTS public.job_payment_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  outcome text NOT NULL,
  job_id bigint,
  stripe_payment_intent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_company_id_fkey;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.job_companies(id) ON DELETE RESTRICT;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_branch_id_fkey;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES public.job_company_branches(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION havkar_private.job_publicly_visible(target public.jobs)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target.status = 'active'
    AND target.expires_at IS NOT NULL
    AND target.expires_at > now()
    AND (
      target.employer_kind = 'ordinary'
      OR EXISTS (
        SELECT 1
        FROM public.job_subscriptions subscription
        WHERE subscription.company_id = target.company_id
          AND subscription.status = 'active'
          AND subscription.current_period_end IS NOT NULL
          AND subscription.current_period_end > now()
      )
    );
$$;

REVOKE ALL ON FUNCTION havkar_private.job_publicly_visible(public.jobs) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION havkar_private.job_publicly_visible(public.jobs) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.enforce_job_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  active_count integer;
  advertisement_limit integer;
  member_ok boolean;
BEGIN
  IF NEW.employer_kind = 'company' AND NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.job_companies company
      JOIN public.job_company_members member
        ON member.company_id = company.id
       AND member.user_id = NEW.user_id
      WHERE company.id = NEW.company_id
        AND company.verification_status = 'verified'
        AND (
          NEW.branch_id IS NULL
          OR member.member_role = 'owner'
          OR member.branch_id = NEW.branch_id
        )
    ) INTO member_ok;

    IF NOT COALESCE(member_ok, false) THEN
      RAISE EXCEPTION 'company advertisement activation requires a verified company and an authorized member'
        USING ERRCODE = '42501';
    END IF;

    SELECT subscription.active_advertisement_limit
      INTO advertisement_limit
    FROM public.job_subscriptions subscription
    WHERE subscription.company_id = NEW.company_id
      AND subscription.status = 'active'
      AND subscription.current_period_end > now();

    IF advertisement_limit IS NULL THEN
      RAISE EXCEPTION 'company advertisement activation requires an active subscription'
        USING ERRCODE = '42501';
    END IF;

    SELECT count(*)
      INTO active_count
    FROM public.jobs existing
    WHERE existing.company_id = NEW.company_id
      AND existing.status = 'active'
      AND existing.expires_at IS NOT NULL
      AND existing.expires_at > now()
      AND existing.id IS DISTINCT FROM NEW.id;

    IF active_count >= advertisement_limit THEN
      RAISE EXCEPTION 'company subscription advertisement limit reached'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'job owner mismatch'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM 'pending_payment' OR NEW.expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new job cannot be activated by the client'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.monthly_fee IS DISTINCT FROM OLD.monthly_fee
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.employer_kind IS DISTINCT FROM OLD.employer_kind
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'job payment, ownership, and subscription fields are locked'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.enforce_job_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION havkar_private.add_job_company_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.job_company_members (company_id, user_id, member_role)
  VALUES (NEW.id, NEW.owner_user_id, 'owner')
  ON CONFLICT (company_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.add_job_company_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS job_companies_add_owner ON public.job_companies;
CREATE TRIGGER job_companies_add_owner
  AFTER INSERT ON public.job_companies
  FOR EACH ROW
  EXECUTE FUNCTION havkar_private.add_job_company_owner();

DROP TRIGGER IF EXISTS jobs_enforce_client_write ON public.jobs;
CREATE TRIGGER jobs_enforce_client_write
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION havkar_private.enforce_job_write();

DROP POLICY IF EXISTS "Enable read access for all users" ON public.jobs;

CREATE POLICY "Jobs are visible to the public only while paid and unexpired"
ON public.jobs
FOR SELECT
TO anon, authenticated
USING (
  havkar_private.job_publicly_visible(jobs)
  OR user_id = (SELECT auth.uid())
);

ALTER TABLE public.job_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_company_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_companies_member_select
ON public.job_companies
FOR SELECT
TO authenticated
USING (
  owner_user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.job_company_members member
    WHERE member.company_id = job_companies.id
      AND member.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY job_companies_owner_insert
ON public.job_companies
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = (SELECT auth.uid())
  AND verification_status = 'unverified'
);

CREATE POLICY job_company_members_select
ON public.job_company_members
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY job_company_branches_select
ON public.job_company_branches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_company_members member
    WHERE member.company_id = job_company_branches.company_id
      AND member.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY job_subscriptions_member_select
ON public.job_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_company_members member
    WHERE member.company_id = job_subscriptions.company_id
      AND member.user_id = (SELECT auth.uid())
  )
);

REVOKE ALL ON TABLE public.jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.jobs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jobs TO authenticated;
GRANT ALL ON TABLE public.jobs TO service_role;

REVOKE ALL ON SEQUENCE public.jobs_id_seq FROM PUBLIC, anon;
GRANT USAGE, SELECT ON SEQUENCE public.jobs_id_seq TO authenticated, service_role;

REVOKE ALL ON TABLE public.job_companies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.job_companies TO authenticated;
GRANT ALL ON TABLE public.job_companies TO service_role;

REVOKE ALL ON TABLE public.job_company_branches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.job_company_branches TO authenticated;
GRANT ALL ON TABLE public.job_company_branches TO service_role;

REVOKE ALL ON TABLE public.job_company_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.job_company_members TO authenticated;
GRANT ALL ON TABLE public.job_company_members TO service_role;

REVOKE ALL ON TABLE public.job_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.job_subscriptions TO authenticated;
GRANT ALL ON TABLE public.job_subscriptions TO service_role;

REVOKE ALL ON TABLE public.job_payment_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.job_payment_events TO service_role;
