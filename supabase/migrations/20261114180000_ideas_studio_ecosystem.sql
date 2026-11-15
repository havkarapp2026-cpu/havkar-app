-- HAVKAR Ideas Portal + Studio + multi-tenant ventures + Aldo pilot foundation.
-- Ideas are private by default. Payments, public publish, ownership transfer remain OFF.
-- This migration does not enable live payouts or replace marketplace fees.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.havkar_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.venture_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  intended_audience text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT '',
  budget_range text NOT NULL DEFAULT '',
  development_goals text NOT NULL DEFAULT '',
  preferred_business_model text NOT NULL DEFAULT '',
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  reviewer_notes text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT venture_ideas_title_check
    CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  CONSTRAINT venture_ideas_category_check
    CHECK (category IN (
      'website',
      'restaurant',
      'shop',
      'marketplace',
      'community',
      'booking',
      'sports',
      'hardware',
      'dashboard',
      'other'
    )),
  CONSTRAINT venture_ideas_description_check
    CHECK (char_length(btrim(description)) BETWEEN 20 AND 8000),
  CONSTRAINT venture_ideas_status_check
    CHECK (status IN (
      'draft',
      'submitted',
      'in_review',
      'approved',
      'rejected',
      'withdrawn'
    )),
  CONSTRAINT venture_ideas_media_is_array
    CHECK (jsonb_typeof(media) = 'array')
);

CREATE INDEX IF NOT EXISTS venture_ideas_owner_updated_idx
  ON public.venture_ideas (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS venture_ideas_status_idx
  ON public.venture_ideas (status, updated_at DESC);

DROP TRIGGER IF EXISTS venture_ideas_set_updated_at ON public.venture_ideas;
CREATE TRIGGER venture_ideas_set_updated_at
  BEFORE UPDATE ON public.venture_ideas
  FOR EACH ROW EXECUTE FUNCTION public.havkar_set_updated_at();

CREATE TABLE IF NOT EXISTS public.venture_idea_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.venture_ideas (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users (id),
  from_status text,
  to_status text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS venture_idea_events_idea_idx
  ON public.venture_idea_events (idea_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ventures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid REFERENCES public.venture_ideas (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  template_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  subdomain_proposal text NOT NULL DEFAULT '',
  payments_enabled boolean NOT NULL DEFAULT false,
  public_publish_enabled boolean NOT NULL DEFAULT false,
  is_aldo_pilot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT ventures_slug_check
    CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])?$'),
  CONSTRAINT ventures_name_check
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT ventures_status_check
    CHECK (status IN (
      'draft',
      'in_builder',
      'pending_review',
      'approved_unpublished',
      'rejected',
      'archived'
    )),
  CONSTRAINT ventures_config_object
    CHECK (jsonb_typeof(config) = 'object'),
  CONSTRAINT ventures_payments_off_check
    CHECK (payments_enabled = false),
  CONSTRAINT ventures_public_publish_off_check
    CHECK (public_publish_enabled = false)
);

CREATE UNIQUE INDEX IF NOT EXISTS ventures_slug_uidx ON public.ventures (slug);
CREATE INDEX IF NOT EXISTS ventures_created_by_idx
  ON public.ventures (created_by, updated_at DESC);

DROP TRIGGER IF EXISTS ventures_set_updated_at ON public.ventures;
CREATE TRIGGER ventures_set_updated_at
  BEFORE UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public.havkar_set_updated_at();

CREATE TABLE IF NOT EXISTS public.venture_members (
  venture_id uuid NOT NULL REFERENCES public.ventures (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (venture_id, user_id),
  CONSTRAINT venture_members_role_check
    CHECK (role IN ('owner', 'editor', 'viewer', 'platform_reviewer'))
);

CREATE INDEX IF NOT EXISTS venture_members_user_idx
  ON public.venture_members (user_id);

CREATE TABLE IF NOT EXISTS public.venture_app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES public.ventures (id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  config_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL REFERENCES auth.users (id),
  review_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT venture_app_versions_number_check
    CHECK (version_number >= 1),
  CONSTRAINT venture_app_versions_status_check
    CHECK (status IN (
      'draft',
      'pending_review',
      'approved',
      'rejected',
      'rolled_back'
    )),
  CONSTRAINT venture_app_versions_unique
    UNIQUE (venture_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.venture_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid REFERENCES public.ventures (id) ON DELETE SET NULL,
  idea_id uuid REFERENCES public.venture_ideas (id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users (id),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT venture_audit_action_check
    CHECK (char_length(action) BETWEEN 2 AND 80)
);

CREATE INDEX IF NOT EXISTS venture_audit_venture_idx
  ON public.venture_audit_events (venture_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.venture_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES public.ventures (id) ON DELETE CASCADE,
  proposed_havkar_share_bps integer NOT NULL DEFAULT 7000,
  proposed_partner_share_bps integer NOT NULL DEFAULT 3000,
  accounting_policy_version text NOT NULL DEFAULT 'havkar-net-profit-v1-draft',
  status text NOT NULL DEFAULT 'draft',
  partner_accepted_at timestamptz,
  owner_approved_at timestamptz,
  payouts_enabled boolean NOT NULL DEFAULT false,
  legal_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT venture_agreements_share_sum_check
    CHECK (proposed_havkar_share_bps + proposed_partner_share_bps = 10000),
  CONSTRAINT venture_agreements_status_check
    CHECK (status IN (
      'draft',
      'presented',
      'partner_accepted_pending_owner',
      'owner_approved_inactive',
      'terminated'
    )),
  CONSTRAINT venture_agreements_payouts_off_check
    CHECK (payouts_enabled = false)
);

DROP TRIGGER IF EXISTS venture_agreements_set_updated_at ON public.venture_agreements;
CREATE TRIGGER venture_agreements_set_updated_at
  BEFORE UPDATE ON public.venture_agreements
  FOR EACH ROW EXECUTE FUNCTION public.havkar_set_updated_at();

CREATE TABLE IF NOT EXISTS public.venture_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES public.ventures (id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  memo text NOT NULL DEFAULT '',
  is_simulated boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT venture_ledger_entry_type_check
    CHECK (entry_type IN (
      'gross_revenue',
      'eligible_expense',
      'net_profit_calc',
      'proposed_distribution'
    )),
  CONSTRAINT venture_ledger_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT venture_ledger_simulated_default_check
    CHECK (is_simulated = true)
);

CREATE INDEX IF NOT EXISTS venture_ledger_venture_idx
  ON public.venture_ledger_entries (venture_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.aldo_pilot_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES public.ventures (id) ON DELETE CASCADE,
  device_label text NOT NULL,
  pairing_code text NOT NULL,
  protocol_version text NOT NULL DEFAULT 'havkar-aldo-ble-v0',
  sensor_status text NOT NULL DEFAULT 'not_installed',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT aldo_devices_label_check
    CHECK (char_length(btrim(device_label)) BETWEEN 2 AND 80),
  CONSTRAINT aldo_devices_sensor_status_check
    CHECK (sensor_status IN (
      'not_installed',
      'planned',
      'paired_simulated',
      'paired_live_unavailable'
    ))
);

CREATE TABLE IF NOT EXISTS public.aldo_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES public.ventures (id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.aldo_pilot_devices (id) ON DELETE SET NULL,
  player_user_id uuid REFERENCES auth.users (id),
  player_display_name text NOT NULL DEFAULT 'Player',
  mode text NOT NULL DEFAULT 'simulation',
  started_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ended_at timestamptz,
  kick_count integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  CONSTRAINT aldo_sessions_mode_check
    CHECK (mode IN ('simulation', 'live_sensor_unavailable')),
  CONSTRAINT aldo_sessions_kick_count_check
    CHECK (kick_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.aldo_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.aldo_training_sessions (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'simulation',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT aldo_events_type_check
    CHECK (event_type IN (
      'session_start',
      'kick_contact',
      'session_end',
      'pairing_ping',
      'integrity_check'
    )),
  CONSTRAINT aldo_events_source_check
    CHECK (source IN ('simulation', 'sensor_unavailable')),
  CONSTRAINT aldo_events_no_fake_force_check
    CHECK (
      NOT (payload ? 'force_newtons')
      AND NOT (payload ? 'accuracy_score')
    )
);

-- Membership helpers (security definer in private schema)
CREATE OR REPLACE FUNCTION havkar_private.venture_is_member(p_venture_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venture_members m
    WHERE m.venture_id = p_venture_id
      AND m.user_id = auth.uid()
  )
  OR COALESCE(havkar_private.caller_is_owner(), false);
$$;

CREATE OR REPLACE FUNCTION havkar_private.venture_has_role(
  p_venture_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venture_members m
    WHERE m.venture_id = p_venture_id
      AND m.user_id = auth.uid()
      AND m.role = ANY (p_roles)
  )
  OR COALESCE(havkar_private.caller_is_owner(), false);
$$;

REVOKE ALL ON FUNCTION havkar_private.venture_is_member(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION havkar_private.venture_has_role(uuid, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION havkar_private.venture_is_member(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION havkar_private.venture_has_role(uuid, text[])
  TO authenticated, service_role;

-- RLS
ALTER TABLE public.venture_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_idea_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_app_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aldo_pilot_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aldo_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aldo_session_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.venture_ideas FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.venture_idea_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ventures FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.venture_members FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.venture_app_versions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.venture_audit_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.venture_agreements FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.venture_ledger_entries FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.aldo_pilot_devices FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.aldo_training_sessions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.aldo_session_events FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.venture_ideas TO authenticated;
GRANT SELECT, INSERT ON TABLE public.venture_idea_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ventures TO authenticated;
GRANT SELECT ON TABLE public.venture_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.venture_app_versions TO authenticated;
GRANT SELECT, INSERT ON TABLE public.venture_audit_events TO authenticated;
GRANT SELECT ON TABLE public.venture_agreements TO authenticated;
GRANT SELECT ON TABLE public.venture_ledger_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.aldo_pilot_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.aldo_training_sessions TO authenticated;
GRANT SELECT, INSERT ON TABLE public.aldo_session_events TO authenticated;

GRANT ALL ON TABLE public.venture_ideas TO service_role;
GRANT ALL ON TABLE public.venture_idea_events TO service_role;
GRANT ALL ON TABLE public.ventures TO service_role;
GRANT ALL ON TABLE public.venture_members TO service_role;
GRANT ALL ON TABLE public.venture_app_versions TO service_role;
GRANT ALL ON TABLE public.venture_audit_events TO service_role;
GRANT ALL ON TABLE public.venture_agreements TO service_role;
GRANT ALL ON TABLE public.venture_ledger_entries TO service_role;
GRANT ALL ON TABLE public.aldo_pilot_devices TO service_role;
GRANT ALL ON TABLE public.aldo_training_sessions TO service_role;
GRANT ALL ON TABLE public.aldo_session_events TO service_role;

-- Ideas: owner only; platform owner can review all
DROP POLICY IF EXISTS venture_ideas_owner_select ON public.venture_ideas;
CREATE POLICY venture_ideas_owner_select
  ON public.venture_ideas FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR COALESCE(havkar_private.caller_is_owner(), false)
  );

DROP POLICY IF EXISTS venture_ideas_owner_insert ON public.venture_ideas;
CREATE POLICY venture_ideas_owner_insert
  ON public.venture_ideas FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS venture_ideas_owner_update ON public.venture_ideas;
CREATE POLICY venture_ideas_owner_update
  ON public.venture_ideas FOR UPDATE TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR COALESCE(havkar_private.caller_is_owner(), false)
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR COALESCE(havkar_private.caller_is_owner(), false)
  );

DROP POLICY IF EXISTS venture_ideas_owner_delete ON public.venture_ideas;
CREATE POLICY venture_ideas_owner_delete
  ON public.venture_ideas FOR DELETE TO authenticated
  USING (
    owner_user_id = auth.uid()
    AND status IN ('draft', 'withdrawn')
  );

DROP POLICY IF EXISTS venture_idea_events_select ON public.venture_idea_events;
CREATE POLICY venture_idea_events_select
  ON public.venture_idea_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venture_ideas i
      WHERE i.id = idea_id
        AND (
          i.owner_user_id = auth.uid()
          OR COALESCE(havkar_private.caller_is_owner(), false)
        )
    )
  );

DROP POLICY IF EXISTS venture_idea_events_insert ON public.venture_idea_events;
CREATE POLICY venture_idea_events_insert
  ON public.venture_idea_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venture_ideas i
      WHERE i.id = idea_id
        AND (
          i.owner_user_id = auth.uid()
          OR COALESCE(havkar_private.caller_is_owner(), false)
        )
    )
  );

DROP POLICY IF EXISTS ventures_member_select ON public.ventures;
CREATE POLICY ventures_member_select
  ON public.ventures FOR SELECT TO authenticated
  USING (havkar_private.venture_is_member(id));

DROP POLICY IF EXISTS ventures_creator_insert ON public.ventures;
CREATE POLICY ventures_creator_insert
  ON public.ventures FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND payments_enabled = false
    AND public_publish_enabled = false
  );

DROP POLICY IF EXISTS ventures_editor_update ON public.ventures;
CREATE POLICY ventures_editor_update
  ON public.ventures FOR UPDATE TO authenticated
  USING (havkar_private.venture_has_role(id, ARRAY['owner', 'editor', 'platform_reviewer']))
  WITH CHECK (
    havkar_private.venture_has_role(id, ARRAY['owner', 'editor', 'platform_reviewer'])
    AND payments_enabled = false
    AND public_publish_enabled = false
  );

DROP POLICY IF EXISTS venture_members_select ON public.venture_members;
CREATE POLICY venture_members_select
  ON public.venture_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR havkar_private.venture_is_member(venture_id)
  );

DROP POLICY IF EXISTS venture_versions_select ON public.venture_app_versions;
CREATE POLICY venture_versions_select
  ON public.venture_app_versions FOR SELECT TO authenticated
  USING (havkar_private.venture_is_member(venture_id));

DROP POLICY IF EXISTS venture_versions_insert ON public.venture_app_versions;
CREATE POLICY venture_versions_insert
  ON public.venture_app_versions FOR INSERT TO authenticated
  WITH CHECK (
    havkar_private.venture_has_role(venture_id, ARRAY['owner', 'editor'])
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS venture_versions_update ON public.venture_app_versions;
CREATE POLICY venture_versions_update
  ON public.venture_app_versions FOR UPDATE TO authenticated
  USING (havkar_private.venture_has_role(venture_id, ARRAY['owner', 'editor', 'platform_reviewer']));

DROP POLICY IF EXISTS venture_audit_select ON public.venture_audit_events;
CREATE POLICY venture_audit_select
  ON public.venture_audit_events FOR SELECT TO authenticated
  USING (
    (venture_id IS NOT NULL AND havkar_private.venture_is_member(venture_id))
    OR (
      idea_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.venture_ideas i
        WHERE i.id = idea_id
          AND (
            i.owner_user_id = auth.uid()
            OR COALESCE(havkar_private.caller_is_owner(), false)
          )
      )
    )
    OR COALESCE(havkar_private.caller_is_owner(), false)
  );

DROP POLICY IF EXISTS venture_audit_insert ON public.venture_audit_events;
CREATE POLICY venture_audit_insert
  ON public.venture_audit_events FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

DROP POLICY IF EXISTS venture_agreements_select ON public.venture_agreements;
CREATE POLICY venture_agreements_select
  ON public.venture_agreements FOR SELECT TO authenticated
  USING (havkar_private.venture_is_member(venture_id));

DROP POLICY IF EXISTS venture_ledger_select ON public.venture_ledger_entries;
CREATE POLICY venture_ledger_select
  ON public.venture_ledger_entries FOR SELECT TO authenticated
  USING (havkar_private.venture_is_member(venture_id));

DROP POLICY IF EXISTS aldo_devices_select ON public.aldo_pilot_devices;
CREATE POLICY aldo_devices_select
  ON public.aldo_pilot_devices FOR SELECT TO authenticated
  USING (havkar_private.venture_is_member(venture_id));

DROP POLICY IF EXISTS aldo_devices_write ON public.aldo_pilot_devices;
CREATE POLICY aldo_devices_write
  ON public.aldo_pilot_devices FOR INSERT TO authenticated
  WITH CHECK (havkar_private.venture_has_role(venture_id, ARRAY['owner', 'editor']));

DROP POLICY IF EXISTS aldo_devices_update ON public.aldo_pilot_devices;
CREATE POLICY aldo_devices_update
  ON public.aldo_pilot_devices FOR UPDATE TO authenticated
  USING (havkar_private.venture_has_role(venture_id, ARRAY['owner', 'editor']));

DROP POLICY IF EXISTS aldo_sessions_select ON public.aldo_training_sessions;
CREATE POLICY aldo_sessions_select
  ON public.aldo_training_sessions FOR SELECT TO authenticated
  USING (havkar_private.venture_is_member(venture_id));

DROP POLICY IF EXISTS aldo_sessions_insert ON public.aldo_training_sessions;
CREATE POLICY aldo_sessions_insert
  ON public.aldo_training_sessions FOR INSERT TO authenticated
  WITH CHECK (
    havkar_private.venture_is_member(venture_id)
    AND mode IN ('simulation', 'live_sensor_unavailable')
  );

DROP POLICY IF EXISTS aldo_sessions_update ON public.aldo_training_sessions;
CREATE POLICY aldo_sessions_update
  ON public.aldo_training_sessions FOR UPDATE TO authenticated
  USING (havkar_private.venture_is_member(venture_id));

DROP POLICY IF EXISTS aldo_events_select ON public.aldo_session_events;
CREATE POLICY aldo_events_select
  ON public.aldo_session_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.aldo_training_sessions s
      WHERE s.id = session_id
        AND havkar_private.venture_is_member(s.venture_id)
    )
  );

DROP POLICY IF EXISTS aldo_events_insert ON public.aldo_session_events;
CREATE POLICY aldo_events_insert
  ON public.aldo_session_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.aldo_training_sessions s
      WHERE s.id = session_id
        AND havkar_private.venture_is_member(s.venture_id)
    )
    AND source IN ('simulation', 'sensor_unavailable')
    AND NOT (payload ? 'force_newtons')
    AND NOT (payload ? 'accuracy_score')
  );
