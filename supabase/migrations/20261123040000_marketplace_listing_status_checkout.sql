-- Align marketplace listing statuses with Stripe Checkout fulfillment.
-- Live enforce_ad_listing_status previously allowed only draft|active for
-- marketplace rows, so webhook updates to ended/refunded/disputed failed.
-- Also adds reserved for short-lived anti double-sell during Checkout.

CREATE OR REPLACE FUNCTION public.enforce_ad_listing_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  normalized text;
  surface text;
  old_surface text;
  is_client boolean := (current_user = 'authenticated');
  is_admin boolean := false;
  allowed_ad_status text[] := ARRAY[
    'active', 'paused', 'ended', 'pending_review', 'rejected'
  ];
  allowed_marketplace_status text[] := ARRAY[
    'draft', 'active', 'reserved', 'ended', 'refunded', 'disputed'
  ];
  owner_transition_ok boolean := false;
BEGIN
  BEGIN
    is_admin := COALESCE(havkar_private.caller_is_admin(), false);
  EXCEPTION
    WHEN undefined_function THEN
      is_admin := false;
  END;

  surface := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.listing_surface, '')));
  IF surface NOT IN ('marketplace', 'advertising') THEN
    RAISE EXCEPTION 'invalid listing surface' USING ERRCODE = '23514';
  END IF;
  NEW.listing_surface := surface;

  IF TG_OP = 'UPDATE' THEN
    old_surface := pg_catalog.lower(pg_catalog.btrim(COALESCE(OLD.listing_surface, '')));
    IF surface IS DISTINCT FROM old_surface THEN
      IF is_client AND NOT is_admin THEN
        RAISE EXCEPTION 'listing_surface cannot be changed by owners'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF is_client AND NOT is_admin THEN
      IF NEW.moderation_notes IS DISTINCT FROM OLD.moderation_notes THEN
        RAISE EXCEPTION 'moderation_notes is not owner-writable'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.reported_count IS DISTINCT FROM OLD.reported_count THEN
        RAISE EXCEPTION 'reported_count is not owner-writable'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'ad ownership cannot be transferred by owners'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  normalized := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.status, '')));

  IF surface = 'advertising' THEN
    IF TG_OP = 'INSERT' THEN
      IF is_client
         AND NOT havkar_private.caller_is_approved_advertiser()
         AND NOT is_admin THEN
        RAISE EXCEPTION 'only approved business advertisers can publish ads'
          USING ERRCODE = '42501';
      END IF;
      IF normalized IN ('', 'pending_review', 'active') THEN
        NEW.status := CASE
          WHEN current_user = 'service_role' AND normalized = 'active' THEN 'active'
          ELSE 'pending_review'
        END;
      ELSIF normalized = ANY (allowed_ad_status) THEN
        IF is_client AND NOT is_admin THEN
          RAISE EXCEPTION 'new advertisements must enter pending_review'
            USING ERRCODE = '42501';
        END IF;
        NEW.status := normalized;
      ELSE
        RAISE EXCEPTION 'invalid advertisement status' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF is_client AND NOT is_admin THEN
          IF NEW.user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
            RAISE EXCEPTION 'cannot change another advertiser ad' USING ERRCODE = '42501';
          END IF;
          owner_transition_ok := (
            (OLD.status = 'pending_review' AND normalized = 'ended')
            OR (OLD.status = 'active' AND normalized IN ('paused', 'ended'))
            OR (OLD.status = 'paused' AND normalized IN ('active', 'ended'))
          );
          IF NOT owner_transition_ok THEN
            RAISE EXCEPTION 'advertisement status transition not allowed'
              USING ERRCODE = '42501';
          END IF;
        END IF;
        IF normalized <> ALL (allowed_ad_status) THEN
          RAISE EXCEPTION 'invalid advertisement status' USING ERRCODE = '23514';
        END IF;
        NEW.status := normalized;
      END IF;
    END IF;
    IF NEW.starts_at IS NOT NULL AND NEW.expires_at IS NOT NULL
       AND NEW.expires_at <= NEW.starts_at THEN
      RAISE EXCEPTION 'expires_at must be after starts_at' USING ERRCODE = '23514';
    END IF;
  ELSE
    -- marketplace surface
    IF TG_OP = 'INSERT' THEN
      IF normalized IN ('', 'draft') THEN
        NEW.status := 'draft';
      ELSIF normalized = 'active' THEN
        NEW.status := 'active';
      ELSIF is_client AND NOT is_admin THEN
        RAISE EXCEPTION 'marketplace listings must start as draft or active'
          USING ERRCODE = '23514';
      ELSIF normalized = ANY (allowed_marketplace_status) THEN
        NEW.status := normalized;
      ELSE
        RAISE EXCEPTION 'invalid marketplace listing status' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF is_client AND NOT is_admin THEN
          IF NEW.user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
            RAISE EXCEPTION 'cannot change another seller listing' USING ERRCODE = '42501';
          END IF;
          -- Owners may end/pause their own active listings. Reserved/ended/refunded/disputed
          -- are service_role (Checkout/webhook) transitions only.
          owner_transition_ok := (
            (OLD.status = 'draft' AND normalized IN ('active', 'ended'))
            OR (OLD.status = 'active' AND normalized IN ('draft', 'ended'))
            OR (OLD.status = 'reserved' AND normalized = 'active')
          );
          IF NOT owner_transition_ok THEN
            RAISE EXCEPTION 'marketplace status transition not allowed for owners'
              USING ERRCODE = '42501';
          END IF;
        END IF;
        IF normalized <> ALL (allowed_marketplace_status) THEN
          RAISE EXCEPTION 'invalid marketplace listing status' USING ERRCODE = '23514';
        END IF;
        NEW.status := normalized;
      END IF;
    END IF;
  END IF;

  IF NEW.video_path IS NOT NULL THEN
    IF NEW.user_id IS NULL
       OR position(NEW.user_id::text || '/' IN NEW.video_path) <> 1
       OR position('..' IN NEW.video_path) > 0
    THEN
      RAISE EXCEPTION 'listing video path is not owned by this user'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
