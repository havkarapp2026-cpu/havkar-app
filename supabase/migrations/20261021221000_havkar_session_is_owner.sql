-- Owner access matches the isolated staging contract.
-- It does not assign an owner or insert an identity row.
-- Do not apply this file to production until the owner approves it.

CREATE TABLE IF NOT EXISTS havkar_private.owner_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  role_generation bigint NOT NULL CHECK (role_generation > 0),
  phrase_hash text NOT NULL,
  recovery_code_hash text NOT NULL,
  established_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS havkar_private.owner_acceptance (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('bootstrap', 'recovery')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, purpose)
);

CREATE TABLE IF NOT EXISTS havkar_private.account_deletion_guard (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS havkar_private.role_assignments (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'staff')),
  role_generation bigint NOT NULL CHECK (role_generation > 0),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION havkar_private.jwt_role_generation()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw text;
BEGIN
  raw := auth.jwt() -> 'app_metadata' ->> 'role_generation';
  IF raw IS NULL OR raw !~ '^[0-9]+$' THEN
    RETURN NULL;
  END IF;
  RETURN raw::bigint;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.jwt_session_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw text;
BEGIN
  raw := auth.jwt() ->> 'session_id';
  IF raw IS NULL OR raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.session_is_live(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.sessions session_row
    WHERE session_row.user_id = p_user_id
      AND session_row.id = havkar_private.jwt_session_id()
  );
$$;

CREATE OR REPLACE FUNCTION havkar_private.caller_is_owner()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  generation bigint := havkar_private.jwt_role_generation();
BEGIN
  IF actor IS NULL OR generation IS NULL THEN
    RETURN false;
  END IF;
  IF NOT havkar_private.session_is_live(actor) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM havkar_private.owner_identity owner_row
    WHERE owner_row.singleton
      AND owner_row.user_id = actor
      AND owner_row.role_generation = generation
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.enforce_owner_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'owner identity cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  IF current_setting('havkar.owner_mutation', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'owner identity cannot be written directly'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM havkar_private.account_deletion_guard guard_row
    WHERE guard_row.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'owner assignment refused during account deletion'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM havkar_private.owner_acceptance acceptance
      WHERE acceptance.user_id = NEW.user_id
        AND acceptance.purpose = 'bootstrap'
        AND acceptance.expires_at > pg_catalog.now()
    ) THEN
      RAISE EXCEPTION 'initial owner requires live acceptance'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.singleton IS DISTINCT FROM OLD.singleton
     OR NEW.role_generation <= OLD.role_generation THEN
    RAISE EXCEPTION 'owner generation must increase'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM havkar_private.role_assignments assignment
    WHERE assignment.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'owner cannot keep admin or staff'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.havkar_session_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT havkar_private.caller_is_owner();
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'owner_identity_guard'
      AND tgrelid = 'havkar_private.owner_identity'::regclass
  ) THEN
    CREATE TRIGGER owner_identity_guard
    BEFORE INSERT OR DELETE OR UPDATE
    ON havkar_private.owner_identity
    FOR EACH ROW
    EXECUTE FUNCTION havkar_private.enforce_owner_identity_guard();
  END IF;
END $$;

REVOKE ALL ON TABLE havkar_private.owner_identity FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE havkar_private.owner_acceptance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE havkar_private.account_deletion_guard FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE havkar_private.role_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION havkar_private.caller_is_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.havkar_session_is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION havkar_private.caller_is_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.havkar_session_is_owner() TO authenticated;
