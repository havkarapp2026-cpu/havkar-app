-- Development migration for one Owner, database-backed Admin checks, and Staff permissions.
-- Do not apply this file to production until a separate owner approval.
-- It assigns no Owner and activates no payment.
-- Account recovery uses arm_owner_recovery and commit_owner_recovery.
-- Do not replace caller_is_admin with a JWT role comparison.
-- Do not apply this file to gispovnciifgikvgpzck until a separate approval.
-- Running it inserts no owner and updates no auth user.

CREATE SCHEMA IF NOT EXISTS havkar_private;

REVOKE CREATE ON SCHEMA havkar_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS havkar_private.owner_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE RESTRICT,
  role_generation bigint NOT NULL CHECK (role_generation > 0),
  phrase_hash text NOT NULL,
  recovery_code_hash text NOT NULL,
  established_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS havkar_private.bootstrap_seal (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL,
  sealed_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS havkar_private.owner_acceptance (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('bootstrap', 'recovery')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, purpose)
);

CREATE TABLE IF NOT EXISTS havkar_private.role_assignments (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'staff')),
  role_generation bigint NOT NULL CHECK (role_generation > 0),
  granted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS havkar_private.admin_permissions (
  user_id uuid NOT NULL REFERENCES havkar_private.role_assignments (user_id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN (
    'admin.read_commission',
    'admin.read_accommodation_drafts'
  )),
  PRIMARY KEY (user_id, permission)
);

CREATE TABLE IF NOT EXISTS havkar_private.staff_permissions (
  user_id uuid NOT NULL REFERENCES havkar_private.role_assignments (user_id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN (
    'staff.review_accommodation',
    'staff.read_commission',
    'staff.read_accommodation_drafts'
  )),
  PRIMARY KEY (user_id, permission)
);

CREATE TABLE IF NOT EXISTS havkar_private.owner_transfer_arm (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  arm_id uuid NOT NULL UNIQUE,
  target_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  expected_generation bigint NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS havkar_private.owner_recovery_arm (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  arm_id uuid NOT NULL UNIQUE,
  target_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz
);

CREATE TABLE IF NOT EXISTS havkar_private.consumed_arms (
  arm_id uuid PRIMARY KEY,
  consumed_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS havkar_private.security_approvals (
  change_key text PRIMARY KEY CHECK (change_key = 'payment_activation'),
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  role_generation bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS havkar_private.role_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS havkar_private.account_deletion_guard (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE havkar_private.owner_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.owner_identity FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.bootstrap_seal ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.bootstrap_seal FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.owner_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.owner_acceptance FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.role_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.admin_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.staff_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.owner_transfer_arm ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.owner_transfer_arm FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.owner_recovery_arm ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.owner_recovery_arm FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.consumed_arms ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.consumed_arms FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.security_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.security_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.role_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.role_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.account_deletion_guard ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.account_deletion_guard FORCE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA havkar_private FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA havkar_private
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

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

DROP TRIGGER IF EXISTS owner_identity_guard ON havkar_private.owner_identity;
CREATE TRIGGER owner_identity_guard
  BEFORE INSERT OR UPDATE OR DELETE ON havkar_private.owner_identity
  FOR EACH ROW EXECUTE FUNCTION havkar_private.enforce_owner_identity_guard();

CREATE OR REPLACE FUNCTION havkar_private.enforce_acceptance_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('havkar.acceptance', true) IS DISTINCT FROM 'on'
     OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'acceptance must come from that signed-in account'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS owner_acceptance_guard ON havkar_private.owner_acceptance;
CREATE TRIGGER owner_acceptance_guard
  BEFORE INSERT OR UPDATE ON havkar_private.owner_acceptance
  FOR EACH ROW EXECUTE FUNCTION havkar_private.enforce_acceptance_guard();

CREATE OR REPLACE FUNCTION havkar_private.enforce_bootstrap_seal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT'
     OR current_setting('havkar.owner_mutation', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'bootstrap seal cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bootstrap_seal_guard ON havkar_private.bootstrap_seal;
CREATE TRIGGER bootstrap_seal_guard
  BEFORE INSERT OR UPDATE OR DELETE ON havkar_private.bootstrap_seal
  FOR EACH ROW EXECUTE FUNCTION havkar_private.enforce_bootstrap_seal();

CREATE OR REPLACE FUNCTION havkar_private.enforce_recovery_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.accepted_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF current_setting('havkar.acceptance', true) IS DISTINCT FROM 'on'
     OR auth.uid() IS DISTINCT FROM NEW.target_user_id THEN
    RAISE EXCEPTION 'recovery acceptance refused'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS owner_recovery_acceptance_guard ON havkar_private.owner_recovery_arm;
CREATE TRIGGER owner_recovery_acceptance_guard
  BEFORE INSERT OR UPDATE ON havkar_private.owner_recovery_arm
  FOR EACH ROW EXECUTE FUNCTION havkar_private.enforce_recovery_acceptance();

CREATE OR REPLACE FUNCTION havkar_private.enforce_role_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  assigned text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM havkar_private.owner_identity owner_row
    WHERE owner_row.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'owner cannot hold admin or staff'
      USING ERRCODE = '42501';
  END IF;

  SELECT assignment.role INTO assigned
  FROM havkar_private.role_assignments assignment
  WHERE assignment.user_id = NEW.user_id;

  IF TG_TABLE_NAME = 'admin_permissions' THEN
    IF assigned IS DISTINCT FROM 'admin' OR left(NEW.permission, 6) IS DISTINCT FROM 'admin.' THEN
      RAISE EXCEPTION 'admin permission requires an admin assignment'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'staff_permissions' THEN
    IF assigned IS DISTINCT FROM 'staff' OR left(NEW.permission, 6) IS DISTINCT FROM 'staff.' THEN
      RAISE EXCEPTION 'staff permission requires a staff assignment'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_permissions_separated ON havkar_private.admin_permissions;
CREATE TRIGGER admin_permissions_separated
  BEFORE INSERT OR UPDATE ON havkar_private.admin_permissions
  FOR EACH ROW EXECUTE FUNCTION havkar_private.enforce_role_separation();

DROP TRIGGER IF EXISTS staff_permissions_separated ON havkar_private.staff_permissions;
CREATE TRIGGER staff_permissions_separated
  BEFORE INSERT OR UPDATE ON havkar_private.staff_permissions
  FOR EACH ROW EXECUTE FUNCTION havkar_private.enforce_role_separation();

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

CREATE OR REPLACE FUNCTION havkar_private.caller_has_permission(p_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  generation bigint := havkar_private.jwt_role_generation();
  owner_id uuid;
BEGIN
  IF actor IS NULL OR generation IS NULL OR p_permission IS NULL THEN
    RETURN false;
  END IF;
  IF NOT havkar_private.session_is_live(actor) THEN
    RETURN false;
  END IF;

  SELECT owner_row.user_id INTO owner_id
  FROM havkar_private.owner_identity owner_row
  WHERE owner_row.singleton;

  IF actor = owner_id THEN
    RETURN p_permission = ANY (ARRAY[
      'owner.manage_admins',
      'owner.manage_staff',
      'owner.approve_security_change',
      'owner.authorize_payment_activation',
      'owner.transfer_ownership'
    ]::text[])
    AND EXISTS (
      SELECT 1
      FROM havkar_private.owner_identity owner_row
      WHERE owner_row.user_id = actor
        AND owner_row.role_generation = generation
    );
  END IF;

  IF left(p_permission, 6) = 'admin.' THEN
    RETURN EXISTS (
      SELECT 1
      FROM havkar_private.role_assignments assignment
      JOIN havkar_private.admin_permissions permission_row
        ON permission_row.user_id = assignment.user_id
       AND permission_row.permission = p_permission
      WHERE assignment.user_id = actor
        AND assignment.role = 'admin'
        AND assignment.role_generation = generation
        AND NOT EXISTS (
          SELECT 1 FROM havkar_private.staff_permissions staff_row
          WHERE staff_row.user_id = assignment.user_id
        )
    );
  END IF;

  IF left(p_permission, 6) = 'staff.' THEN
    RETURN EXISTS (
      SELECT 1
      FROM havkar_private.role_assignments assignment
      JOIN havkar_private.staff_permissions permission_row
        ON permission_row.user_id = assignment.user_id
       AND permission_row.permission = p_permission
      WHERE assignment.user_id = actor
        AND assignment.role = 'staff'
        AND assignment.role_generation = generation
        AND assignment.user_id IS DISTINCT FROM owner_id
        AND NOT EXISTS (
          SELECT 1 FROM havkar_private.admin_permissions admin_row
          WHERE admin_row.user_id = assignment.user_id
        )
    );
  END IF;

  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.caller_matches_admin_assignment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_has_permission('admin.read_commission')
     AND havkar_private.caller_has_permission('admin.read_accommodation_drafts');
$$;

CREATE OR REPLACE FUNCTION havkar_private.caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_matches_admin_assignment();
$$;

REVOKE ALL ON FUNCTION havkar_private.caller_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION havkar_private.caller_is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.havkar_session_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_is_admin();
$$;

REVOKE ALL ON FUNCTION public.havkar_session_is_admin() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.havkar_session_is_admin() TO authenticated;

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

CREATE OR REPLACE FUNCTION public.havkar_session_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_is_owner();
$$;

REVOKE ALL ON FUNCTION public.havkar_session_is_owner() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.havkar_session_is_owner() TO authenticated;

CREATE OR REPLACE FUNCTION havkar_private.phrases_match(p_phrase text, p_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_hash IS NOT NULL
     AND p_phrase IS NOT NULL
     AND extensions.crypt(p_phrase, p_hash) = p_hash;
$$;

CREATE OR REPLACE FUNCTION havkar_private.assert_secret_pair(
  p_secret text,
  p_confirm text,
  p_minimum integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_secret IS NULL
     OR p_confirm IS NULL
     OR p_secret IS DISTINCT FROM p_confirm
     OR pg_catalog.octet_length(p_secret) < p_minimum
     OR pg_catalog.octet_length(p_secret) > 72 THEN
    RAISE EXCEPTION 'secret confirmation was rejected'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.write_role_claim(
  p_user_id uuid,
  p_role text,
  p_generation bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
    CASE
      WHEN p_role IS NULL THEN
        coalesce(raw_app_meta_data, '{}'::jsonb) - 'role' - 'role_generation'
      ELSE
        coalesce(raw_app_meta_data, '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'role', p_role,
          'role_generation', p_generation
        )
    END
  WHERE id = p_user_id;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.lock_owner()
RETURNS havkar_private.owner_identity
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(841420261);
  SELECT * INTO owner_row
  FROM havkar_private.owner_identity
  WHERE singleton
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner is not established'
      USING ERRCODE = '42501';
  END IF;
  RETURN owner_row;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.assert_owner_action(
  p_permission text,
  p_phrase text,
  p_expected_generation bigint
)
RETURNS havkar_private.owner_identity
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
BEGIN
  owner_row := havkar_private.lock_owner();
  IF auth.uid() IS DISTINCT FROM owner_row.user_id
     OR p_expected_generation IS DISTINCT FROM owner_row.role_generation
     OR havkar_private.jwt_role_generation() IS DISTINCT FROM owner_row.role_generation
     OR NOT havkar_private.session_is_live(owner_row.user_id)
     OR NOT havkar_private.caller_has_permission(p_permission)
     OR NOT havkar_private.phrases_match(p_phrase, owner_row.phrase_hash) THEN
    RAISE EXCEPTION 'owner action refused'
      USING ERRCODE = '42501';
  END IF;
  RETURN owner_row;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.accept_owner_identity(p_purpose text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR p_purpose NOT IN ('bootstrap', 'recovery') THEN
    RAISE EXCEPTION 'acceptance refused'
      USING ERRCODE = '42501';
  END IF;

  IF p_purpose = 'bootstrap' AND EXISTS (
    SELECT 1 FROM havkar_private.owner_identity
  ) THEN
    RAISE EXCEPTION 'acceptance refused'
      USING ERRCODE = '42501';
  END IF;

  IF p_purpose = 'recovery' AND NOT EXISTS (
    SELECT 1
    FROM havkar_private.owner_recovery_arm arm
    WHERE arm.target_user_id = actor
      AND arm.expires_at > pg_catalog.now()
  ) THEN
    RAISE EXCEPTION 'acceptance refused'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('havkar.acceptance', 'on', true);
  INSERT INTO havkar_private.owner_acceptance (user_id, purpose, expires_at)
  VALUES (actor, p_purpose, pg_catalog.now() + interval '15 minutes')
  ON CONFLICT (user_id, purpose)
  DO UPDATE SET expires_at = EXCLUDED.expires_at;

  IF p_purpose = 'recovery' THEN
    UPDATE havkar_private.owner_recovery_arm
    SET accepted_at = pg_catalog.now()
    WHERE target_user_id = actor
      AND expires_at > pg_catalog.now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_owner_identity(p_purpose text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM havkar_private.accept_owner_identity(p_purpose);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_owner_identity(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.accept_owner_identity(text) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.accept_owner_identity(text) TO authenticated;

CREATE OR REPLACE FUNCTION havkar_private.establish_initial_owner(
  p_user_id uuid,
  p_confirm_user_id uuid,
  p_phrase text,
  p_confirm_phrase text,
  p_recovery_code text,
  p_confirm_recovery_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF session_user IS DISTINCT FROM current_user THEN
    RAISE EXCEPTION 'project database session required'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(841420261);
  PERFORM havkar_private.assert_secret_pair(p_phrase, p_confirm_phrase, 16);
  PERFORM havkar_private.assert_secret_pair(p_recovery_code, p_confirm_recovery_code, 20);

  IF p_user_id IS NULL
     OR p_user_id IS DISTINCT FROM p_confirm_user_id
     OR p_phrase = p_recovery_code
     OR EXISTS (SELECT 1 FROM havkar_private.owner_identity)
     OR EXISTS (SELECT 1 FROM havkar_private.bootstrap_seal)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id)
     OR NOT EXISTS (
       SELECT 1 FROM havkar_private.owner_acceptance acceptance
       WHERE acceptance.user_id = p_user_id
         AND acceptance.purpose = 'bootstrap'
         AND acceptance.expires_at > pg_catalog.now()
     )
     OR EXISTS (
       SELECT 1 FROM havkar_private.account_deletion_guard guard_row
       WHERE guard_row.user_id = p_user_id
     ) THEN
    RAISE EXCEPTION 'initial owner was not established'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM havkar_private.role_assignments WHERE user_id = p_user_id;
  PERFORM set_config('havkar.owner_mutation', 'on', true);
  INSERT INTO havkar_private.owner_identity (
    user_id, role_generation, phrase_hash, recovery_code_hash
  ) VALUES (
    p_user_id,
    1,
    extensions.crypt(p_phrase, extensions.gen_salt('bf', 8)),
    extensions.crypt(p_recovery_code, extensions.gen_salt('bf', 8))
  );

  INSERT INTO havkar_private.bootstrap_seal (user_id) VALUES (p_user_id);
  DELETE FROM havkar_private.owner_acceptance
  WHERE user_id = p_user_id AND purpose = 'bootstrap';
  PERFORM havkar_private.write_role_claim(p_user_id, 'owner', 1);
  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (NULL, 'establish_initial_owner', p_user_id);
  RETURN p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.establish_initial_owner(uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.grant_admin(
  p_target uuid,
  p_phrase text,
  p_expected_generation bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
  next_generation bigint;
BEGIN
  owner_row := havkar_private.assert_owner_action(
    'owner.manage_admins', p_phrase, p_expected_generation
  );
  IF p_target IS NULL
     OR p_target = owner_row.user_id
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target) THEN
    RAISE EXCEPTION 'admin grant refused'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM havkar_private.staff_permissions WHERE user_id = p_target;
  DELETE FROM havkar_private.role_assignments WHERE user_id = p_target;
  next_generation := 1;
  INSERT INTO havkar_private.role_assignments (
    user_id, role, role_generation, granted_by
  ) VALUES (
    p_target, 'admin', next_generation, owner_row.user_id
  );
  INSERT INTO havkar_private.admin_permissions (user_id, permission) VALUES
    (p_target, 'admin.read_commission'),
    (p_target, 'admin.read_accommodation_drafts');
  PERFORM havkar_private.write_role_claim(p_target, 'admin', next_generation);
  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (owner_row.user_id, 'grant_admin', p_target);
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.revoke_admin(
  p_target uuid,
  p_phrase text,
  p_expected_generation bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
BEGIN
  owner_row := havkar_private.assert_owner_action(
    'owner.manage_admins', p_phrase, p_expected_generation
  );
  IF NOT EXISTS (
    SELECT 1 FROM havkar_private.role_assignments
    WHERE user_id = p_target AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin revoke refused'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM havkar_private.role_assignments WHERE user_id = p_target;
  PERFORM havkar_private.write_role_claim(p_target, NULL, NULL);
  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (owner_row.user_id, 'revoke_admin', p_target);
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.grant_staff_permission(
  p_target uuid,
  p_permission text,
  p_phrase text,
  p_expected_generation bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
  next_generation bigint;
BEGIN
  owner_row := havkar_private.assert_owner_action(
    'owner.manage_staff', p_phrase, p_expected_generation
  );
  IF p_target IS NULL
     OR p_target = owner_row.user_id
     OR p_permission NOT IN (
       'staff.review_accommodation',
       'staff.read_commission',
       'staff.read_accommodation_drafts'
     )
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target)
     OR EXISTS (
       SELECT 1 FROM havkar_private.role_assignments
       WHERE user_id = p_target AND role = 'admin'
     ) THEN
    RAISE EXCEPTION 'staff grant refused'
      USING ERRCODE = '42501';
  END IF;

  SELECT assignment.role_generation + 1 INTO next_generation
  FROM havkar_private.role_assignments assignment
  WHERE assignment.user_id = p_target
    AND assignment.role = 'staff'
  FOR UPDATE;

  IF next_generation IS NULL THEN
    next_generation := 1;
    INSERT INTO havkar_private.role_assignments (
      user_id, role, role_generation, granted_by
    ) VALUES (
      p_target, 'staff', next_generation, owner_row.user_id
    );
  ELSE
    UPDATE havkar_private.role_assignments
    SET role_generation = next_generation,
        granted_by = owner_row.user_id,
        granted_at = pg_catalog.now()
    WHERE user_id = p_target;
  END IF;

  INSERT INTO havkar_private.staff_permissions (user_id, permission)
  VALUES (p_target, p_permission)
  ON CONFLICT DO NOTHING;
  PERFORM havkar_private.write_role_claim(p_target, 'staff', next_generation);
  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (owner_row.user_id, 'grant_staff_permission', p_target);
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.revoke_staff_permission(
  p_target uuid,
  p_permission text,
  p_phrase text,
  p_expected_generation bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
  next_generation bigint;
BEGIN
  owner_row := havkar_private.assert_owner_action(
    'owner.manage_staff', p_phrase, p_expected_generation
  );
  DELETE FROM havkar_private.staff_permissions
  WHERE user_id = p_target AND permission = p_permission;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff revoke refused'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM havkar_private.staff_permissions WHERE user_id = p_target
  ) THEN
    UPDATE havkar_private.role_assignments
    SET role_generation = role_generation + 1
    WHERE user_id = p_target AND role = 'staff'
    RETURNING role_generation INTO next_generation;
    PERFORM havkar_private.write_role_claim(p_target, 'staff', next_generation);
  ELSE
    DELETE FROM havkar_private.role_assignments
    WHERE user_id = p_target AND role = 'staff';
    PERFORM havkar_private.write_role_claim(p_target, NULL, NULL);
  END IF;

  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (owner_row.user_id, 'revoke_staff_permission', p_target);
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.approve_security_change(
  p_change_key text,
  p_phrase text,
  p_expected_generation bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
BEGIN
  owner_row := havkar_private.assert_owner_action(
    'owner.approve_security_change', p_phrase, p_expected_generation
  );
  IF p_change_key IS DISTINCT FROM 'payment_activation' THEN
    RAISE EXCEPTION 'security change refused'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO havkar_private.security_approvals (
    change_key, approved_by, role_generation
  ) VALUES (
    p_change_key, owner_row.user_id, owner_row.role_generation
  )
  ON CONFLICT (change_key) DO UPDATE
    SET approved_by = EXCLUDED.approved_by,
        approved_at = pg_catalog.now(),
        role_generation = EXCLUDED.role_generation;
  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (owner_row.user_id, 'approve_security_change', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.authorize_payment_activation(
  p_phrase text,
  p_expected_generation bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM havkar_private.approve_security_change(
    'payment_activation', p_phrase, p_expected_generation
  );
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.arm_ownership_transfer(
  p_target uuid,
  p_confirm_target uuid,
  p_phrase text,
  p_expected_generation bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
  new_arm uuid := pg_catalog.gen_random_uuid();
BEGIN
  owner_row := havkar_private.assert_owner_action(
    'owner.transfer_ownership', p_phrase, p_expected_generation
  );
  IF p_target IS NULL
     OR p_target IS DISTINCT FROM p_confirm_target
     OR p_target = owner_row.user_id
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target)
     OR havkar_private.jwt_session_id() IS NULL
     OR EXISTS (
       SELECT 1 FROM havkar_private.account_deletion_guard guard_row
       WHERE guard_row.user_id = p_target
     ) THEN
    RAISE EXCEPTION 'transfer arm refused'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM havkar_private.owner_transfer_arm
  WHERE expires_at <= pg_catalog.now();
  IF EXISTS (SELECT 1 FROM havkar_private.owner_transfer_arm) THEN
    RAISE EXCEPTION 'transfer arm refused'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO havkar_private.owner_transfer_arm (
    arm_id, target_user_id, session_id, expected_generation, expires_at
  ) VALUES (
    new_arm,
    p_target,
    havkar_private.jwt_session_id(),
    owner_row.role_generation,
    pg_catalog.now() + interval '15 minutes'
  );
  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (owner_row.user_id, 'arm_ownership_transfer', p_target);
  RETURN new_arm;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.commit_ownership_transfer(
  p_arm_id uuid,
  p_target uuid,
  p_confirm_target uuid,
  p_phrase text,
  p_expected_generation bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
  arm havkar_private.owner_transfer_arm;
  next_generation bigint;
BEGIN
  owner_row := havkar_private.assert_owner_action(
    'owner.transfer_ownership', p_phrase, p_expected_generation
  );
  SELECT * INTO arm
  FROM havkar_private.owner_transfer_arm
  WHERE singleton
  FOR UPDATE;

  IF NOT FOUND
     OR arm.arm_id IS DISTINCT FROM p_arm_id
     OR arm.target_user_id IS DISTINCT FROM p_target
     OR p_target IS DISTINCT FROM p_confirm_target
     OR arm.session_id IS DISTINCT FROM havkar_private.jwt_session_id()
     OR arm.expected_generation IS DISTINCT FROM owner_row.role_generation
     OR arm.expires_at <= pg_catalog.now()
     OR EXISTS (SELECT 1 FROM havkar_private.consumed_arms WHERE arm_id = p_arm_id)
     OR EXISTS (
       SELECT 1 FROM havkar_private.account_deletion_guard guard_row
       WHERE guard_row.user_id = p_target
     ) THEN
    RAISE EXCEPTION 'transfer commit refused'
      USING ERRCODE = '42501';
  END IF;

  next_generation := owner_row.role_generation + 1;
  INSERT INTO havkar_private.consumed_arms (arm_id) VALUES (p_arm_id);
  DELETE FROM havkar_private.owner_transfer_arm WHERE arm_id = p_arm_id;
  DELETE FROM havkar_private.role_assignments WHERE user_id = p_target;
  PERFORM set_config('havkar.owner_mutation', 'on', true);
  UPDATE havkar_private.owner_identity
  SET user_id = p_target,
      role_generation = next_generation
  WHERE singleton;
  PERFORM havkar_private.write_role_claim(owner_row.user_id, NULL, NULL);
  PERFORM havkar_private.write_role_claim(p_target, 'owner', next_generation);
  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (owner_row.user_id, 'commit_ownership_transfer', p_target);
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.arm_owner_recovery(
  p_target uuid,
  p_confirm_target uuid,
  p_recovery_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
  new_arm uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF session_user IS DISTINCT FROM current_user THEN
    RAISE EXCEPTION 'project database session required'
      USING ERRCODE = '42501';
  END IF;
  owner_row := havkar_private.lock_owner();
  IF p_target IS NULL
     OR p_target IS DISTINCT FROM p_confirm_target
     OR p_target = owner_row.user_id
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target)
     OR NOT havkar_private.phrases_match(p_recovery_code, owner_row.recovery_code_hash)
     OR EXISTS (
       SELECT 1 FROM havkar_private.account_deletion_guard guard_row
       WHERE guard_row.user_id = p_target
     ) THEN
    RAISE EXCEPTION 'recovery arm refused'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM havkar_private.owner_recovery_arm
  WHERE expires_at <= pg_catalog.now();
  IF EXISTS (SELECT 1 FROM havkar_private.owner_recovery_arm) THEN
    RAISE EXCEPTION 'recovery arm refused'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO havkar_private.owner_recovery_arm (
    arm_id, target_user_id, expires_at
  ) VALUES (
    new_arm, p_target, pg_catalog.now() + interval '15 minutes'
  );
  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (NULL, 'arm_owner_recovery', p_target);
  RETURN new_arm;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.commit_owner_recovery(
  p_arm_id uuid,
  p_target uuid,
  p_confirm_target uuid,
  p_recovery_code text,
  p_phrase text,
  p_confirm_phrase text,
  p_next_recovery_code text,
  p_confirm_next_recovery_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  owner_row havkar_private.owner_identity;
  arm havkar_private.owner_recovery_arm;
  next_generation bigint;
BEGIN
  IF session_user IS DISTINCT FROM current_user THEN
    RAISE EXCEPTION 'project database session required'
      USING ERRCODE = '42501';
  END IF;
  PERFORM havkar_private.assert_secret_pair(p_phrase, p_confirm_phrase, 16);
  PERFORM havkar_private.assert_secret_pair(
    p_next_recovery_code, p_confirm_next_recovery_code, 20
  );
  owner_row := havkar_private.lock_owner();
  SELECT * INTO arm
  FROM havkar_private.owner_recovery_arm
  WHERE singleton
  FOR UPDATE;

  IF p_phrase = p_next_recovery_code
     OR NOT FOUND
     OR arm.arm_id IS DISTINCT FROM p_arm_id
     OR arm.target_user_id IS DISTINCT FROM p_target
     OR p_target IS DISTINCT FROM p_confirm_target
     OR arm.accepted_at IS NULL
     OR arm.expires_at <= pg_catalog.now()
     OR NOT havkar_private.phrases_match(p_recovery_code, owner_row.recovery_code_hash)
     OR EXISTS (
       SELECT 1 FROM havkar_private.consumed_arms consumed
       WHERE consumed.arm_id = p_arm_id
     )
     OR EXISTS (
       SELECT 1 FROM havkar_private.account_deletion_guard guard_row
       WHERE guard_row.user_id = p_target
     ) THEN
    RAISE EXCEPTION 'recovery commit refused'
      USING ERRCODE = '42501';
  END IF;

  next_generation := owner_row.role_generation + 1;
  INSERT INTO havkar_private.consumed_arms (arm_id) VALUES (p_arm_id);
  DELETE FROM havkar_private.owner_recovery_arm WHERE arm_id = p_arm_id;
  DELETE FROM havkar_private.role_assignments WHERE user_id = p_target;
  PERFORM set_config('havkar.owner_mutation', 'on', true);
  UPDATE havkar_private.owner_identity
  SET user_id = p_target,
      role_generation = next_generation,
      phrase_hash = extensions.crypt(p_phrase, extensions.gen_salt('bf', 8)),
      recovery_code_hash = extensions.crypt(
        p_next_recovery_code, extensions.gen_salt('bf', 8)
      )
  WHERE singleton;
  PERFORM havkar_private.write_role_claim(owner_row.user_id, NULL, NULL);
  PERFORM havkar_private.write_role_claim(p_target, 'owner', next_generation);
  DELETE FROM havkar_private.owner_acceptance
  WHERE user_id = p_target AND purpose = 'recovery';
  INSERT INTO havkar_private.role_audit (actor_id, action, target_id)
  VALUES (NULL, 'commit_owner_recovery', p_target);
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.arm_owner_recovery(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION havkar_private.commit_owner_recovery(
  uuid, uuid, uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION havkar_private.grant_admin(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.revoke_admin(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.grant_staff_permission(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.revoke_staff_permission(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.approve_security_change(text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.authorize_payment_activation(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.arm_ownership_transfer(uuid, uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.commit_ownership_transfer(uuid, uuid, uuid, text, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION havkar_private.enforce_deletion_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('havkar.deletion_guard', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'deletion guard cannot be written directly'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_deletion_guard_write ON havkar_private.account_deletion_guard;
CREATE TRIGGER account_deletion_guard_write
  BEFORE INSERT OR UPDATE ON havkar_private.account_deletion_guard
  FOR EACH ROW EXECUTE FUNCTION havkar_private.enforce_deletion_guard();

CREATE OR REPLACE FUNCTION havkar_private.prepare_account_deletion(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(841420261);
  SELECT owner_row.user_id INTO owner_id
  FROM havkar_private.owner_identity owner_row
  WHERE owner_row.singleton
  FOR UPDATE;

  IF p_user_id IS NULL
     OR p_user_id = owner_id
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN false;
  END IF;

  PERFORM set_config('havkar.deletion_guard', 'on', true);
  INSERT INTO havkar_private.account_deletion_guard (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.prepare_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.havkar_account_deletion_allowed(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT havkar_private.prepare_account_deletion(p_user_id);
$$;

REVOKE ALL ON FUNCTION public.havkar_account_deletion_allowed(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.havkar_account_deletion_allowed(uuid) TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA havkar_private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION havkar_private.caller_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.caller_is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.accept_owner_identity(text) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.grant_admin(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.revoke_admin(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.grant_staff_permission(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.revoke_staff_permission(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.approve_security_change(text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.authorize_payment_activation(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.arm_ownership_transfer(uuid, uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.commit_ownership_transfer(uuid, uuid, uuid, text, bigint) TO authenticated;
