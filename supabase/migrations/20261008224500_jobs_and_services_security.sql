-- Jobs and Services authorization.
-- Prepared from the committed public schema snapshot dated 2026-10-07.
-- This file does not INSERT, UPDATE, or DELETE any row.
-- It does not add columns, payment tables, or a payment verifier.
-- Do not treat this migration as proof that a job payment succeeded.

-- Jobs: public.jobs.status has no check constraint in the snapshot.
-- Its default is 'active', and the public SELECT policy is USING (true).
-- Authenticated INSERT and UPDATE policies only compare user_id.
-- service_bookings INSERT compares services.provider_id to itself.
-- Booking UPDATE policies do not compare the previous status.

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

ALTER TABLE public.jobs
  ALTER COLUMN status SET DEFAULT 'pending_payment';

DROP POLICY IF EXISTS "Enable read access for all users" ON public.jobs;

CREATE POLICY "Enable read access for all users"
ON public.jobs
AS PERMISSIVE
FOR SELECT
TO public
USING (
  status = 'active'
  OR (SELECT auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.jobs;

CREATE POLICY "Enable insert for users based on user_id"
ON public.jobs
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND status IS DISTINCT FROM 'active'
);

-- The existing owner UPDATE and DELETE policies stay in place:
-- "Users can update own jobs"
-- "Enable delete for users based on user_id"
-- Row Level Security cannot compare OLD.status with NEW.status.
-- The trigger below is the publication control for every role,
-- including service_role, which bypasses RLS.

CREATE OR REPLACE FUNCTION public.enforce_job_publication_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user = 'anon' THEN
    RAISE EXCEPTION 'anonymous users cannot create or change jobs'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL THEN
      NEW.status := 'pending_payment';
    END IF;

    IF NEW.status IS NOT DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'jobs cannot be created as active before payment verification'
        USING ERRCODE = '42501';
    END IF;

    IF current_user = 'authenticated'
       AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'jobs can only be created for the current user'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'job owner cannot be reassigned'
        USING ERRCODE = '42501';
    END IF;

    IF current_user = 'authenticated'
       AND OLD.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'users cannot change another user job'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS NOT DISTINCT FROM 'active'
       AND OLD.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'unpaid jobs cannot become active until a server-side payment verifier is installed'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF current_user = 'authenticated'
       AND OLD.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'users cannot delete another user job'
        USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'enforce_job_publication_status is a trigger function'
    USING ERRCODE = '0A000';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_job_publication_status()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_job_publication_status()
  TO service_role;

DROP TRIGGER IF EXISTS enforce_job_publication_status ON public.jobs;

CREATE TRIGGER enforce_job_publication_status
BEFORE INSERT OR DELETE OR UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_job_publication_status();

-- ---------------------------------------------------------------------------
-- Service bookings
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Customers can create bookings" ON public.service_bookings;

CREATE POLICY "Customers can create bookings"
ON public.service_bookings
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id = (SELECT auth.uid())
  AND provider_id <> (SELECT auth.uid())
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.services AS s
    WHERE s.id = service_bookings.service_id
      AND s.provider_id = service_bookings.provider_id
      AND s.status = 'active'
  )
);

DROP POLICY IF EXISTS "Customers can cancel own bookings" ON public.service_bookings;

CREATE POLICY "Customers can cancel own bookings"
ON public.service_bookings
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  AND status IN ('pending', 'accepted')
)
WITH CHECK (
  customer_id = (SELECT auth.uid())
  AND status = 'cancelled'
);

-- Permissive UPDATE policies combine USING with OR and WITH CHECK with OR.
-- Splitting one transition per policy would allow pending to jump to completed.
-- Keep one provider policy for the allowed destination statuses, and enforce
-- the previous status in the trigger.

DROP POLICY IF EXISTS "Providers can update received bookings" ON public.service_bookings;

CREATE POLICY "Providers can update received bookings"
ON public.service_bookings
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  provider_id = (SELECT auth.uid())
  AND status IN ('pending', 'accepted')
)
WITH CHECK (
  provider_id = (SELECT auth.uid())
  AND status IN ('accepted', 'declined', 'completed')
);

-- "Users can view related bookings" is unchanged.
-- No DELETE policy is added.

CREATE OR REPLACE FUNCTION public.enforce_service_booking_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  service_owner uuid;
  service_status text;
BEGIN
  IF current_user = 'anon' THEN
    RAISE EXCEPTION 'anonymous users cannot create or change service bookings'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL THEN
      NEW.status := 'pending';
    END IF;

    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'service bookings must be created as pending'
        USING ERRCODE = '42501';
    END IF;

    IF current_user = 'authenticated'
       AND (
         NEW.customer_id IS DISTINCT FROM auth.uid()
         OR NEW.provider_id IS NOT DISTINCT FROM auth.uid()
       ) THEN
      RAISE EXCEPTION 'customers can only book another provider'
        USING ERRCODE = '42501';
    END IF;

    SELECT s.provider_id, s.status
      INTO service_owner, service_status
    FROM public.services AS s
    WHERE s.id = NEW.service_id;

    IF service_owner IS NULL
       OR service_owner IS DISTINCT FROM NEW.provider_id
       OR service_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'booking provider must be the owner of the selected active service'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.service_id IS DISTINCT FROM OLD.service_id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN
      RAISE EXCEPTION 'booking identity and history cannot be reassigned'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;

    IF current_user = 'authenticated'
       AND auth.uid() = OLD.provider_id
       AND (
         (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined'))
         OR (OLD.status = 'accepted' AND NEW.status = 'completed')
       ) THEN
      RETURN NEW;
    END IF;

    IF current_user = 'authenticated'
       AND auth.uid() = OLD.customer_id
       AND OLD.status IN ('pending', 'accepted')
       AND NEW.status = 'cancelled' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'invalid service booking status transition'
      USING ERRCODE = '42501';
  END IF;

  RAISE EXCEPTION 'enforce_service_booking_write is a trigger function'
    USING ERRCODE = '0A000';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_service_booking_write()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_service_booking_write()
  TO service_role;

DROP TRIGGER IF EXISTS enforce_service_booking_write ON public.service_bookings;

CREATE TRIGGER enforce_service_booking_write
BEFORE INSERT OR UPDATE ON public.service_bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_service_booking_write();
