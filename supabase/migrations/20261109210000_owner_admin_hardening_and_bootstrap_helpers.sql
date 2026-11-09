-- Owner/Admin hardening helpers.
-- Does NOT insert Production owner_identity rows.
-- Bootstrap must be run only with explicit Owner approval via
-- store/OWNER_IDENTITY_BOOTSTRAP.sql after confirmation.

CREATE TABLE IF NOT EXISTS havkar_private.management_events (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL CHECK (
    event_type IN (
      'owner_bootstrap',
      'owner_bootstrap_rollback',
      'owner_recovery_transfer',
      'admin_grant',
      'admin_revoke',
      'admin_elevation_denied',
      'owner_mutation_denied'
    )
  ),
  actor_user_id uuid,
  subject_user_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE havkar_private.management_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE havkar_private.management_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE havkar_private.management_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION havkar_private.record_management_event(
  p_event_type text,
  p_actor uuid,
  p_subject uuid,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO havkar_private.management_events (
    event_type,
    actor_user_id,
    subject_user_id,
    detail
  )
  VALUES (
    p_event_type,
    p_actor,
    p_subject,
    COALESCE(p_detail, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.record_management_event(text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.record_management_event(text, uuid, uuid, jsonb)
  TO service_role;

-- Admin must match private role_assignments + JWT role_generation + live session.
-- JWT claim alone is not enough. Owner is never treated as admin via this path.
CREATE OR REPLACE FUNCTION havkar_private.caller_is_admin()
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

  IF EXISTS (
    SELECT 1
    FROM havkar_private.owner_identity owner_row
    WHERE owner_row.singleton
      AND owner_row.user_id = actor
  ) THEN
    RETURN false;
  END IF;

  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IS DISTINCT FROM 'admin' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM havkar_private.role_assignments assignment
    WHERE assignment.user_id = actor
      AND assignment.role = 'admin'
      AND assignment.role_generation = generation
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
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

REVOKE ALL ON FUNCTION public.havkar_session_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.havkar_session_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION havkar_private.enforce_role_assignments_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('havkar.role_mutation', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'role assignments cannot be deleted directly'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF current_setting('havkar.role_mutation', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'role assignments cannot be written directly'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'unsupported role'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM havkar_private.owner_identity owner_row
    WHERE owner_row.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'owner cannot keep admin or staff'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'role_assignments_guard'
      AND tgrelid = 'havkar_private.role_assignments'::regclass
  ) THEN
    CREATE TRIGGER role_assignments_guard
    BEFORE INSERT OR DELETE OR UPDATE
    ON havkar_private.role_assignments
    FOR EACH ROW
    EXECUTE FUNCTION havkar_private.enforce_role_assignments_guard();
  END IF;
END $$;

-- Owner-only admin grant. Admins cannot grant, demote, or touch Owner.
CREATE OR REPLACE FUNCTION havkar_private.owner_grant_admin(
  p_user_id uuid,
  p_role_generation bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT havkar_private.caller_is_owner() THEN
    PERFORM havkar_private.record_management_event(
      'admin_elevation_denied',
      actor,
      p_user_id,
      jsonb_build_object('reason', 'caller_not_owner')
    );
    RAISE EXCEPTION 'only the primary owner may grant admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_role_generation IS NULL OR p_role_generation <= 0 THEN
    RAISE EXCEPTION 'admin grant requires user_id and positive role_generation'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM havkar_private.owner_identity owner_row
    WHERE owner_row.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'primary owner cannot be assigned admin'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('havkar.role_mutation', 'on', true);

  INSERT INTO havkar_private.role_assignments (
    user_id,
    role,
    role_generation,
    granted_by,
    granted_at
  )
  VALUES (
    p_user_id,
    'admin',
    p_role_generation,
    actor,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    role_generation = EXCLUDED.role_generation,
    granted_by = EXCLUDED.granted_by,
    granted_at = EXCLUDED.granted_at;

  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'role', 'admin',
        'role_generation', p_role_generation::text
      )
  WHERE id = p_user_id;

  PERFORM havkar_private.record_management_event(
    'admin_grant',
    actor,
    p_user_id,
    jsonb_build_object('role_generation', p_role_generation)
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.owner_revoke_admin(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT havkar_private.caller_is_owner() THEN
    PERFORM havkar_private.record_management_event(
      'admin_elevation_denied',
      actor,
      p_user_id,
      jsonb_build_object('reason', 'caller_not_owner_revoke')
    );
    RAISE EXCEPTION 'only the primary owner may revoke admin'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM havkar_private.owner_identity owner_row
    WHERE owner_row.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'primary owner cannot be revoked through admin revoke'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('havkar.role_mutation', 'on', true);

  DELETE FROM havkar_private.role_assignments
  WHERE user_id = p_user_id
    AND role IN ('admin', 'staff');

  UPDATE auth.users
  SET raw_app_meta_data =
    (COALESCE(raw_app_meta_data, '{}'::jsonb) - 'role' - 'role_generation')
  WHERE id = p_user_id;

  PERFORM havkar_private.record_management_event(
    'admin_revoke',
    actor,
    p_user_id,
    '{}'::jsonb
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.owner_grant_admin(uuid, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION havkar_private.owner_revoke_admin(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.owner_grant_admin(uuid, bigint)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.owner_revoke_admin(uuid)
  TO authenticated, service_role;

-- Acceptance rows normally require the signed-in subject.
-- Controlled owner bootstrap may write acceptance under owner_mutation=on.
CREATE OR REPLACE FUNCTION havkar_private.enforce_acceptance_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('havkar.owner_mutation', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF current_setting('havkar.acceptance', true) IS DISTINCT FROM 'on'
     OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'acceptance must come from that signed-in account'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'owner_acceptance_guard'
      AND tgrelid = 'havkar_private.owner_acceptance'::regclass
  ) THEN
    CREATE TRIGGER owner_acceptance_guard
    BEFORE INSERT OR UPDATE
    ON havkar_private.owner_acceptance
    FOR EACH ROW
    EXECUTE FUNCTION havkar_private.enforce_acceptance_guard();
  END IF;
END $$;

-- Controlled singleton bootstrap. Does nothing unless caller sets
-- havkar.owner_mutation=on and supplies acceptance + digests.
CREATE OR REPLACE FUNCTION havkar_private.bootstrap_primary_owner(
  p_user_id uuid,
  p_role_generation bigint,
  p_phrase_hash text,
  p_recovery_code_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('havkar.owner_mutation', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'owner bootstrap requires havkar.owner_mutation=on'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL
     OR p_role_generation IS NULL
     OR p_role_generation <= 0
     OR COALESCE(p_phrase_hash, '') = ''
     OR COALESCE(p_recovery_code_hash, '') = '' THEN
    RAISE EXCEPTION 'owner bootstrap input incomplete'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM havkar_private.owner_identity) THEN
    RAISE EXCEPTION 'primary owner already established'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM havkar_private.role_assignments assignment
    WHERE assignment.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'owner cannot keep admin or staff'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO havkar_private.owner_acceptance (
    user_id,
    purpose,
    expires_at
  )
  VALUES (
    p_user_id,
    'bootstrap',
    now() + interval '1 hour'
  )
  ON CONFLICT (user_id, purpose) DO UPDATE
  SET expires_at = EXCLUDED.expires_at;

  INSERT INTO havkar_private.owner_identity (
    singleton,
    user_id,
    role_generation,
    phrase_hash,
    recovery_code_hash,
    established_at
  )
  VALUES (
    true,
    p_user_id,
    p_role_generation,
    p_phrase_hash,
    p_recovery_code_hash,
    now()
  );

  UPDATE auth.users
  SET raw_app_meta_data =
    (COALESCE(raw_app_meta_data, '{}'::jsonb) - 'role')
      || jsonb_build_object('role_generation', p_role_generation::text)
  WHERE id = p_user_id;

  PERFORM havkar_private.record_management_event(
    'owner_bootstrap',
    NULL,
    p_user_id,
    jsonb_build_object('role_generation', p_role_generation)
  );

  RETURN true;
END;
$$;

-- Allow delete only for controlled bootstrap rollback (not Admin demotion).
CREATE OR REPLACE FUNCTION havkar_private.enforce_owner_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('havkar.owner_bootstrap_rollback', true) IS DISTINCT FROM 'on' THEN
      PERFORM havkar_private.record_management_event(
        'owner_mutation_denied',
        auth.uid(),
        OLD.user_id,
        jsonb_build_object('op', 'DELETE')
      );
      RAISE EXCEPTION 'owner identity cannot be deleted'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF current_setting('havkar.owner_mutation', true) IS DISTINCT FROM 'on' THEN
    PERFORM havkar_private.record_management_event(
      'owner_mutation_denied',
      auth.uid(),
      NEW.user_id,
      jsonb_build_object('op', TG_OP)
    );
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

-- Reverse bootstrap only while rollback flag is set and the singleton still
-- matches the expected user. Intended for failed first-time setup, not demotion by Admin.
CREATE OR REPLACE FUNCTION havkar_private.rollback_bootstrap_owner(
  p_expected_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_owner uuid;
BEGIN
  IF current_setting('havkar.owner_bootstrap_rollback', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'owner bootstrap rollback flag required'
      USING ERRCODE = '42501';
  END IF;

  SELECT owner_row.user_id
  INTO current_owner
  FROM havkar_private.owner_identity owner_row
  WHERE owner_row.singleton
  LIMIT 1;

  IF current_owner IS NULL THEN
    RETURN false;
  END IF;

  IF current_owner IS DISTINCT FROM p_expected_user_id THEN
    RAISE EXCEPTION 'rollback refused: owner mismatch'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM havkar_private.owner_identity
  WHERE user_id = p_expected_user_id;

  DELETE FROM havkar_private.owner_acceptance
  WHERE user_id = p_expected_user_id
    AND purpose = 'bootstrap';

  UPDATE auth.users
  SET raw_app_meta_data =
    (COALESCE(raw_app_meta_data, '{}'::jsonb) - 'role_generation')
  WHERE id = p_expected_user_id;

  PERFORM havkar_private.record_management_event(
    'owner_bootstrap_rollback',
    NULL,
    p_expected_user_id,
    '{}'::jsonb
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.bootstrap_primary_owner(uuid, bigint, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION havkar_private.rollback_bootstrap_owner(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.bootstrap_primary_owner(uuid, bigint, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION havkar_private.rollback_bootstrap_owner(uuid)
  TO service_role;
