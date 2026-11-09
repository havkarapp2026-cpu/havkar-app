-- Owner dashboard role helpers + overview RPC.
-- Does not re-bootstrap owner_identity.

ALTER TABLE havkar_private.role_assignments
  DROP CONSTRAINT IF EXISTS role_assignments_role_check;

ALTER TABLE havkar_private.role_assignments
  ADD CONSTRAINT role_assignments_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'staff'::text, 'support'::text]));

CREATE OR REPLACE FUNCTION havkar_private.jwt_issued_at()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw text;
BEGIN
  raw := auth.jwt() ->> 'iat';
  IF raw IS NULL OR raw !~ '^[0-9]+$' THEN
    RETURN NULL;
  END IF;
  RETURN to_timestamp(raw::double precision);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.session_is_fresh(p_max_age_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  issued timestamptz := havkar_private.jwt_issued_at();
BEGIN
  IF issued IS NULL OR p_max_age_seconds IS NULL OR p_max_age_seconds <= 0 THEN
    RETURN false;
  END IF;
  RETURN issued > (pg_catalog.now() - make_interval(secs => p_max_age_seconds));
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

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

  IF NEW.role NOT IN ('admin', 'staff', 'support') THEN
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

CREATE OR REPLACE FUNCTION havkar_private.caller_has_assigned_role(p_role text)
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
  IF actor IS NULL OR generation IS NULL OR p_role IS NULL THEN
    RETURN false;
  END IF;
  IF NOT havkar_private.session_is_live(actor) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM havkar_private.owner_identity owner_row
    WHERE owner_row.singleton AND owner_row.user_id = actor
  ) THEN
    RETURN false;
  END IF;
  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IS DISTINCT FROM p_role THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM havkar_private.role_assignments assignment
    WHERE assignment.user_id = actor
      AND assignment.role = p_role
      AND assignment.role_generation = generation
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_has_assigned_role('admin');
$$;

CREATE OR REPLACE FUNCTION havkar_private.caller_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_has_assigned_role('staff');
$$;

CREATE OR REPLACE FUNCTION havkar_private.caller_is_support()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_has_assigned_role('support');
$$;

CREATE OR REPLACE FUNCTION public.havkar_session_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_is_admin();
$$;

CREATE OR REPLACE FUNCTION public.havkar_session_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_is_staff();
$$;

CREATE OR REPLACE FUNCTION public.havkar_session_is_support()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT havkar_private.caller_is_support();
$$;

CREATE OR REPLACE FUNCTION public.havkar_session_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF havkar_private.caller_is_owner() THEN
    RETURN 'owner';
  END IF;
  IF havkar_private.caller_is_admin() THEN
    RETURN 'admin';
  END IF;
  IF havkar_private.caller_is_staff() THEN
    RETURN 'staff';
  END IF;
  IF havkar_private.caller_is_support() THEN
    RETURN 'support';
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN 'user';
END;
$$;

REVOKE ALL ON FUNCTION public.havkar_session_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.havkar_session_is_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.havkar_session_is_support() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.havkar_session_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.havkar_session_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.havkar_session_is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.havkar_session_is_support() TO authenticated;
GRANT EXECUTE ON FUNCTION public.havkar_session_role() TO authenticated;

CREATE OR REPLACE FUNCTION havkar_private.owner_assign_role(
  p_user_id uuid,
  p_role text,
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
      jsonb_build_object('reason', 'caller_not_owner', 'role', p_role)
    );
    -- Return false (do not RAISE) so the audit row is not rolled back.
    RETURN false;
  END IF;

  IF NOT havkar_private.session_is_fresh(900) THEN
    PERFORM havkar_private.record_management_event(
      'admin_elevation_denied',
      actor,
      p_user_id,
      jsonb_build_object('reason', 'reauth_required', 'role', p_role)
    );
    RETURN false;
  END IF;

  IF p_user_id IS NULL
     OR p_role_generation IS NULL
     OR p_role_generation <= 0
     OR p_role NOT IN ('admin', 'staff', 'support') THEN
    RAISE EXCEPTION 'role assignment input invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM havkar_private.owner_identity owner_row WHERE owner_row.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'primary owner cannot be assigned a subordinate role'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('havkar.role_mutation', 'on', true);

  INSERT INTO havkar_private.role_assignments (
    user_id, role, role_generation, granted_by, granted_at
  )
  VALUES (p_user_id, p_role, p_role_generation, actor, now())
  ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role,
      role_generation = EXCLUDED.role_generation,
      granted_by = EXCLUDED.granted_by,
      granted_at = EXCLUDED.granted_at;

  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'role', p_role,
        'role_generation', p_role_generation::text
      )
  WHERE id = p_user_id;

  PERFORM havkar_private.record_management_event(
    'admin_grant',
    actor,
    p_user_id,
    jsonb_build_object('role', p_role, 'role_generation', p_role_generation)
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION havkar_private.owner_revoke_role(p_user_id uuid)
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
    -- Return false (do not RAISE) so the audit row is not rolled back.
    RETURN false;
  END IF;

  IF NOT havkar_private.session_is_fresh(900) THEN
    PERFORM havkar_private.record_management_event(
      'admin_elevation_denied',
      actor,
      p_user_id,
      jsonb_build_object('reason', 'reauth_required_revoke')
    );
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM havkar_private.owner_identity owner_row WHERE owner_row.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'primary owner cannot be revoked'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('havkar.role_mutation', 'on', true);

  DELETE FROM havkar_private.role_assignments
  WHERE user_id = p_user_id
    AND role IN ('admin', 'staff', 'support');

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

CREATE OR REPLACE FUNCTION public.havkar_owner_assign_role(
  p_user_id uuid,
  p_role text,
  p_role_generation bigint DEFAULT 1
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT havkar_private.owner_assign_role(p_user_id, p_role, p_role_generation);
$$;

CREATE OR REPLACE FUNCTION public.havkar_owner_revoke_role(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT havkar_private.owner_revoke_role(p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.havkar_list_staff_roles()
RETURNS TABLE (
  user_id uuid,
  email text,
  role text,
  role_generation bigint,
  granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    havkar_private.caller_is_owner()
    OR havkar_private.caller_is_admin()
  ) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ra.user_id,
    u.email::text,
    ra.role,
    ra.role_generation,
    ra.granted_at
  FROM havkar_private.role_assignments ra
  JOIN auth.users u ON u.id = ra.user_id
  ORDER BY ra.granted_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.havkar_owner_dashboard_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_name text := public.havkar_session_role();
  is_owner boolean := role_name = 'owner';
  is_admin boolean := role_name = 'admin';
  is_staff boolean := role_name = 'staff';
  is_support boolean := role_name = 'support';
  payload jsonb;
BEGIN
  IF role_name IS NULL OR role_name = 'user' THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  payload := jsonb_build_object(
    'role', role_name,
    'generated_at', pg_catalog.now(),
    'payments_live', false,
    'overview', jsonb_build_object(
      'users_total', (SELECT count(*)::int FROM auth.users),
      'users_confirmed', (SELECT count(*)::int FROM auth.users WHERE email_confirmed_at IS NOT NULL),
      'ads', (SELECT count(*)::int FROM public.ads),
      'jobs', (SELECT count(*)::int FROM public.jobs),
      'services', (SELECT count(*)::int FROM public.services),
      'events', (SELECT count(*)::int FROM public.events),
      'tickets', (SELECT count(*)::int FROM public.event_tickets),
      'support_requests', (SELECT count(*)::int FROM public.support_requests),
      'business_applications', (SELECT count(*)::int FROM public.business_applications),
      'ai_conversations', (SELECT count(*)::int FROM public.ai_conversations),
      'delivery_requests', (SELECT count(*)::int FROM public.delivery_requests),
      'driver_applications', (SELECT count(*)::int FROM public.driver_applications)
    ),
    'moderation', jsonb_build_object(
      'ad_reports', (SELECT count(*)::int FROM public.ad_reports),
      'service_complaints', (SELECT count(*)::int FROM public.service_complaints),
      'privacy_requests', (SELECT count(*)::int FROM public.privacy_requests),
      'accommodation_reports', (SELECT count(*)::int FROM public.accommodation_reports)
    ),
    'official_emails', jsonb_build_object(
      'info', 'info@havkar.online',
      'support', 'support@havkar.online',
      'soran_visible_to_owner_only', true
    )
  );

  IF is_owner OR is_admin THEN
    payload := payload || jsonb_build_object(
      'staff_roles', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'user_id', ra.user_id,
          'email', u.email,
          'role', ra.role,
          'role_generation', ra.role_generation,
          'granted_at', ra.granted_at
        ) ORDER BY ra.granted_at DESC)
        FROM havkar_private.role_assignments ra
        JOIN auth.users u ON u.id = ra.user_id
      ), '[]'::jsonb),
      'commissions_uncollected', (
        SELECT count(*)::int
        FROM public.service_commission_entries
        WHERE collection_state = 'uncollected'
      )
    );
  END IF;

  IF is_owner THEN
    payload := payload || jsonb_build_object(
      'finance', jsonb_build_object(
        'payment_intents_total', (SELECT count(*)::int FROM public.marketplace_payment_intents),
        'payment_intents_settled', (SELECT count(*)::int FROM public.marketplace_payment_intents WHERE status = 'settled'),
        'payment_intents_unpaid', (SELECT count(*)::int FROM public.marketplace_payment_intents WHERE status = 'unpaid'),
        'wallet_transactions', (SELECT count(*)::int FROM public.wallet_transactions),
        'ai_subscriptions', (SELECT count(*)::int FROM public.ai_subscriptions),
        'job_subscriptions', (SELECT count(*)::int FROM public.job_subscriptions),
        'note', 'Live Stripe/XLM/Pi collection remains gated; counts are informational only.'
      ),
      'security', jsonb_build_object(
        'management_events', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'event_type', e.event_type,
            'actor_user_id', e.actor_user_id,
            'subject_user_id', e.subject_user_id,
            'detail', e.detail,
            'created_at', e.created_at
          ) ORDER BY e.id DESC)
          FROM (
            SELECT * FROM havkar_private.management_events ORDER BY id DESC LIMIT 50
          ) e
        ), '[]'::jsonb),
        'owner_user_id', (
          SELECT owner_row.user_id
          FROM havkar_private.owner_identity owner_row
          WHERE owner_row.singleton
          LIMIT 1
        )
      ),
      'official_emails', jsonb_build_object(
        'info', 'info@havkar.online',
        'support', 'support@havkar.online',
        'soran', 'soran@havkar.online',
        'mailbox_access', 'credentials_not_stored_in_app',
        'personal_gmail_hidden', true
      )
    );
  END IF;

  IF is_owner OR is_admin OR is_support OR is_staff THEN
    payload := payload || jsonb_build_object(
      'support_queue', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', sr.id,
          'topic', sr.topic,
          'status', sr.status,
          'created_at', sr.created_at
        ) ORDER BY sr.created_at DESC)
        FROM (
          SELECT id, topic, status, created_at
          FROM public.support_requests
          ORDER BY created_at DESC
          LIMIT 30
        ) sr
      ), '[]'::jsonb)
    );
  END IF;

  RETURN payload;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.owner_assign_role(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION havkar_private.owner_revoke_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.havkar_owner_assign_role(uuid, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.havkar_owner_revoke_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.havkar_list_staff_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.havkar_owner_dashboard_overview() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.havkar_owner_assign_role(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.havkar_owner_revoke_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.havkar_list_staff_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.havkar_owner_dashboard_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.caller_is_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.caller_is_support() TO authenticated, service_role;
