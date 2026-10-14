-- Stop service_provider_public_stats from publishing completed booking counts.
-- This keeps the view OID, column order, column types, and existing grants.
-- completed_bookings remains as NULL::bigint and no longer reads service_bookings.
-- The published-review aggregate and public profile columns stay as they are.
-- Apply only after explicit approval. Creating or deploying this file does not run it.
-- Do not restore a booking count during recovery. If this migration has committed
-- and the invoker view must be turned off, run only:
--   ALTER VIEW public.service_provider_public_stats SET (security_invoker = false);

DO $$
DECLARE
  cols text;
  types text;
BEGIN
  SELECT string_agg(attname, ',' ORDER BY attnum),
         string_agg(format_type(atttypid, atttypmod), ',' ORDER BY attnum)
    INTO cols, types
  FROM pg_attribute
  WHERE attrelid = 'public.service_provider_public_stats'::regclass
    AND attnum > 0
    AND NOT attisdropped;

  IF cols IS DISTINCT FROM 'provider_id,display_name,avatar_url,description,service_area,verification_status,average_rating,review_count,completed_bookings' THEN
    RAISE EXCEPTION 'service_provider_public_stats column list changed: %', cols;
  END IF;

  IF types IS DISTINCT FROM 'uuid,text,text,text,text,text,numeric,bigint,bigint' THEN
    RAISE EXCEPTION 'service_provider_public_stats column types changed: %', types;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.service_provider_public_stats AS
SELECT
  profile.user_id AS provider_id,
  profile.display_name,
  profile.avatar_url,
  profile.description,
  profile.service_area,
  profile.verification_status,
  COALESCE(reviews.average_rating, 0::numeric) AS average_rating,
  COALESCE(reviews.review_count, 0::bigint) AS review_count,
  NULL::bigint AS completed_bookings
FROM public.service_provider_profiles profile
LEFT JOIN (
  SELECT
    service_reviews.provider_id,
    round(avg(service_reviews.rating), 2) AS average_rating,
    count(*) AS review_count
  FROM public.service_reviews
  WHERE service_reviews.status = 'published'::text
  GROUP BY service_reviews.provider_id
) reviews ON reviews.provider_id = profile.user_id;

ALTER VIEW public.service_provider_public_stats SET (security_invoker = true);

DO $$
DECLARE
  view_sql text;
  options text[];
BEGIN
  view_sql := pg_get_viewdef('public.service_provider_public_stats'::regclass, true);
  IF view_sql ILIKE '%service_bookings%' THEN
    RAISE EXCEPTION 'service_provider_public_stats still reads service_bookings';
  END IF;

  SELECT c.reloptions
    INTO options
  FROM pg_class c
  WHERE c.oid = 'public.service_provider_public_stats'::regclass;

  IF NOT (options @> ARRAY['security_invoker=true']::text[]) THEN
    RAISE EXCEPTION 'security_invoker was not enabled: %', options;
  END IF;
END $$;
