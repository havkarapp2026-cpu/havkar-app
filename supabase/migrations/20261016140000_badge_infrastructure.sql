-- Badge infrastructure.
-- Issuance stays off. This file awards nothing and changes no role.

CREATE SCHEMA IF NOT EXISTS havkar_private;

CREATE TABLE havkar_private.badge_policy (
  singleton boolean PRIMARY KEY DEFAULT true,
  issuance_enabled boolean NOT NULL DEFAULT false,
  CONSTRAINT badge_policy_one_row CHECK (singleton)
);

INSERT INTO havkar_private.badge_policy (singleton, issuance_enabled)
VALUES (true, false);

CREATE TABLE havkar_private.badge_definitions (
  code text PRIMARY KEY,
  audience text NOT NULL,
  title text NOT NULL,
  eligibility text NOT NULL,
  issuance_enabled boolean NOT NULL DEFAULT false,
  CONSTRAINT badge_definitions_code
    CHECK (code IN ('identity_verified', 'business_verified', 'diamond')),
  CONSTRAINT badge_definitions_audience
    CHECK (audience IN ('personal', 'business', 'activity'))
);

INSERT INTO havkar_private.badge_definitions
  (code, audience, title, eligibility, issuance_enabled)
VALUES
  (
    'identity_verified',
    'personal',
    'Green verified check',
    'Personal account with a confirmed email and a reviewed identity. Owner or admin review is required. Signup, user metadata, and the account holder cannot award it.',
    false
  ),
  (
    'business_verified',
    'business',
    'Green star',
    'Business or company page whose owner already has an approved business application. The star is a separate review from publication. The page owner cannot award it.',
    false
  ),
  (
    'diamond',
    'activity',
    'Diamond',
    'Reputation from genuine activity only. Proposed rule, not active: account age of 30 days and 100 points from distinct completed deliveries or completed service bookings. Payments, signups, and self-written text do not count. The account holder cannot award it.',
    false
  );

CREATE TABLE havkar_private.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  badge_code text NOT NULL REFERENCES havkar_private.badge_definitions (code),
  subject_type text NOT NULL,
  subject_id uuid,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  awarded_by uuid,
  revoked_at timestamptz,
  CONSTRAINT user_badges_subject_type
    CHECK (subject_type IN ('account', 'business_page')),
  CONSTRAINT user_badges_no_self_award
    CHECK (awarded_by IS NULL OR awarded_by <> user_id),
  CONSTRAINT user_badges_shape CHECK (
    (
      badge_code = 'identity_verified'
      AND subject_type = 'account'
      AND subject_id IS NULL
    )
    OR (
      badge_code = 'business_verified'
      AND subject_type = 'business_page'
      AND subject_id IS NOT NULL
    )
    OR (
      badge_code = 'diamond'
      AND subject_type = 'account'
      AND subject_id IS NULL
    )
  )
);

CREATE UNIQUE INDEX user_badges_one_account
  ON havkar_private.user_badges (user_id, badge_code)
  WHERE revoked_at IS NULL AND subject_type = 'account';

CREATE UNIQUE INDEX user_badges_one_page
  ON havkar_private.user_badges (user_id, badge_code, subject_id)
  WHERE revoked_at IS NULL AND subject_type = 'business_page';

CREATE TABLE havkar_private.reputation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_code text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reputation_events_code
    CHECK (event_code IN ('delivery_completed', 'service_booking_completed')),
  CONSTRAINT reputation_events_points
    CHECK (points BETWEEN 1 AND 20),
  CONSTRAINT reputation_events_source
    UNIQUE (user_id, event_code, source_table, source_id)
);

ALTER TABLE havkar_private.badge_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE havkar_private.reputation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE havkar_private.badge_policy
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE havkar_private.badge_definitions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE havkar_private.user_badges
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE havkar_private.reputation_events
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.badge_issuance_is_active(target_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM havkar_private.badge_policy policy
    WHERE policy.singleton
      AND policy.issuance_enabled
  )
  AND EXISTS (
    SELECT 1
    FROM havkar_private.badge_definitions definition
    WHERE definition.code = target_code
      AND definition.issuance_enabled
  );
$$;

REVOKE ALL ON FUNCTION havkar_private.badge_issuance_is_active(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.award_badge(
  target_user uuid,
  target_code text,
  target_subject_type text,
  target_subject uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  confirmed timestamptz;
  created timestamptz;
  points integer;
  awarded uuid;
BEGIN
  IF NOT havkar_private.badge_issuance_is_active(target_code) THEN
    RAISE EXCEPTION 'badge issuance is not active'
      USING ERRCODE = '42501';
  END IF;

  IF actor IS NULL
    OR actor = target_user
    OR NOT (
      havkar_private.caller_is_owner()
      OR havkar_private.caller_is_admin()
    )
  THEN
    RAISE EXCEPTION 'badge award requires a different owner or admin'
      USING ERRCODE = '42501';
  END IF;

  SELECT users.email_confirmed_at, users.created_at
  INTO confirmed, created
  FROM auth.users users
  WHERE users.id = target_user;

  IF confirmed IS NULL THEN
    RAISE EXCEPTION 'badge award requires a confirmed account'
      USING ERRCODE = '42501';
  END IF;

  IF target_code = 'business_verified' THEN
    IF target_subject IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.business_pages page
        WHERE page.id = target_subject
          AND page.owner_id = target_user
      )
      OR NOT havkar_private.owner_has_approved_business(target_user)
    THEN
      RAISE EXCEPTION 'business star requires an approved business page'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF target_code = 'diamond' THEN
    SELECT COALESCE(SUM(event.points), 0)
    INTO points
    FROM havkar_private.reputation_events event
    WHERE event.user_id = target_user;

    IF created IS NULL
      OR created > now() - interval '30 days'
      OR points < 100
    THEN
      RAISE EXCEPTION 'diamond requires the approved activity threshold'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO havkar_private.user_badges (
    user_id,
    badge_code,
    subject_type,
    subject_id,
    awarded_by
  )
  VALUES (
    target_user,
    target_code,
    target_subject_type,
    target_subject,
    actor
  )
  RETURNING id INTO awarded;

  RETURN awarded;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.award_badge(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.record_reputation_event(
  target_user uuid,
  target_event text,
  target_source_table text,
  target_source_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recorded uuid;
  points integer;
BEGIN
  IF NOT havkar_private.badge_issuance_is_active('diamond') THEN
    RAISE EXCEPTION 'badge issuance is not active'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NULL
    OR auth.uid() = target_user
    OR NOT (
      havkar_private.caller_is_owner()
      OR havkar_private.caller_is_admin()
    )
  THEN
    RAISE EXCEPTION 'reputation cannot be recorded by the account holder'
      USING ERRCODE = '42501';
  END IF;

  IF target_event = 'delivery_completed' AND target_source_table = 'delivery_requests' THEN
    points := 20;
    IF NOT EXISTS (
      SELECT 1
      FROM public.delivery_requests delivery
      WHERE delivery.id::text = target_source_id
        AND delivery.status = 'delivered'
        AND (
          delivery.user_id = target_user
          OR delivery.driver_id = target_user
        )
    ) THEN
      RAISE EXCEPTION 'reputation requires a delivered request'
        USING ERRCODE = '42501';
    END IF;
  ELSIF target_event = 'service_booking_completed' AND target_source_table = 'service_bookings' THEN
    points := 20;
    IF NOT EXISTS (
      SELECT 1
      FROM public.service_bookings booking
      WHERE booking.id::text = target_source_id
        AND booking.status = 'completed'
        AND (
          booking.customer_id = target_user
          OR booking.provider_id = target_user
        )
    ) THEN
      RAISE EXCEPTION 'reputation requires a completed booking'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'reputation event is not eligible'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO havkar_private.reputation_events (
    user_id,
    event_code,
    source_table,
    source_id,
    points
  )
  VALUES (
    target_user,
    target_event,
    target_source_table,
    target_source_id,
    points
  )
  ON CONFLICT (user_id, event_code, source_table, source_id) DO NOTHING
  RETURNING id INTO recorded;

  RETURN recorded;
END;
$$;

REVOKE ALL ON FUNCTION havkar_private.record_reputation_event(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION havkar_private.list_visible_badges(target_user uuid)
RETURNS TABLE (
  badge_code text,
  subject_type text,
  subject_id uuid,
  awarded_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT badge.badge_code, badge.subject_type, badge.subject_id, badge.awarded_at
  FROM havkar_private.user_badges badge
  WHERE badge.user_id = target_user
    AND badge.revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.list_visible_badges(target uuid)
RETURNS TABLE (
  badge_code text,
  subject_type text,
  subject_id uuid,
  awarded_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT badge.badge_code, badge.subject_type, badge.subject_id, badge.awarded_at
  FROM havkar_private.list_visible_badges(target) badge;
$$;

CREATE OR REPLACE FUNCTION havkar_private.list_visible_page_badges(target_page uuid)
RETURNS TABLE (
  badge_code text,
  awarded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF target_page IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    havkar_private.business_page_is_public(target_page)
    OR havkar_private.caller_owns_business_page(target_page)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT badge.badge_code, badge.awarded_at
  FROM havkar_private.user_badges badge
  WHERE badge.subject_type = 'business_page'
    AND badge.subject_id = target_page
    AND badge.badge_code = 'business_verified'
    AND badge.revoked_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_visible_page_badges(target_page uuid)
RETURNS TABLE (
  badge_code text,
  awarded_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT badge.badge_code, badge.awarded_at
  FROM havkar_private.list_visible_page_badges(target_page) badge;
$$;

REVOKE ALL ON FUNCTION havkar_private.list_visible_badges(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION havkar_private.list_visible_page_badges(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION havkar_private.list_visible_badges(uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION havkar_private.list_visible_page_badges(uuid)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.list_visible_badges(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_visible_page_badges(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_visible_badges(uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_visible_page_badges(uuid)
  TO anon, authenticated;

COMMENT ON TABLE havkar_private.user_badges IS
  'Server-awarded HAVKAR badges. Client roles have no privileges. Issuance is disabled.';
