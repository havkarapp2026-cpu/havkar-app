-- Travel Life completion (additive). Owner-gated apply.
-- Share flags + reminder dedupe log + secure share RPC (no staff private read).

ALTER TABLE public.user_trips
  ADD COLUMN IF NOT EXISTS share_include_media boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_trips
  ADD COLUMN IF NOT EXISTS share_include_geo boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_trips
  ADD COLUMN IF NOT EXISTS share_include_track boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.travel_reminder_dispatch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.user_trips(id) ON DELETE SET NULL,
  kind text NOT NULL,
  channel text NOT NULL,
  year integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT travel_reminder_kind_check CHECK (
    kind = ANY (ARRAY['trip_anniversary'::text,'yearly_recap'::text,'album_memory'::text])
  ),
  CONSTRAINT travel_reminder_channel_check CHECK (
    channel = ANY (ARRAY['in_app'::text,'email'::text,'push'::text])
  ),
  CONSTRAINT travel_reminder_unique UNIQUE (user_id, trip_id, kind, channel, year)
);

CREATE INDEX IF NOT EXISTS travel_reminder_dispatch_user_idx
  ON public.travel_reminder_dispatch (user_id, sent_at DESC);

ALTER TABLE public.travel_reminder_dispatch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminder dispatch owner read" ON public.travel_reminder_dispatch;
CREATE POLICY "reminder dispatch owner read"
  ON public.travel_reminder_dispatch
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.travel_reminder_dispatch FROM anon;
GRANT SELECT ON TABLE public.travel_reminder_dispatch TO authenticated;

-- Public share resolve: only rows with valid unexpired share_token.
CREATE OR REPLACE FUNCTION public.havkar_resolve_trip_share(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.user_trips%ROWTYPE;
  pts jsonb;
  media jsonb;
BEGIN
  IF p_token IS NULL OR char_length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT * INTO t
  FROM public.user_trips
  WHERE share_token = trim(p_token)
    AND share_expires_at IS NOT NULL
    AND share_expires_at > now()
    AND is_private = false
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_expired');
  END IF;

  pts := '[]'::jsonb;
  IF t.share_include_track THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'lat', p.lat, 'lng', p.lng, 'recorded_at', p.recorded_at
    ) ORDER BY p.recorded_at), '[]'::jsonb)
    INTO pts
    FROM (
      SELECT lat, lng, recorded_at
      FROM public.trip_track_points
      WHERE trip_id = t.id
      ORDER BY recorded_at
      LIMIT 2000
    ) p;
  END IF;

  media := '[]'::jsonb;
  IF t.share_include_media THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'media_type', m.media_type,
      'taken_at', m.taken_at,
      'caption', m.caption,
      'lat', CASE WHEN t.share_include_geo THEN m.lat ELSE NULL END,
      'lng', CASE WHEN t.share_include_geo THEN m.lng ELSE NULL END
    ) ORDER BY m.taken_at NULLS LAST), '[]'::jsonb)
    INTO media
    FROM (
      SELECT media_type, taken_at, caption, lat, lng
      FROM public.trip_media
      WHERE trip_id = t.id
        AND is_private = false
      ORDER BY taken_at DESC NULLS LAST
      LIMIT 100
    ) m;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'trip', jsonb_build_object(
      'title', t.title,
      'trip_type', t.trip_type,
      'started_at', t.started_at,
      'ended_at', t.ended_at,
      'distance_m', t.distance_m,
      'duration_s', t.duration_s,
      'origin_label', t.origin_label,
      'destination_label', t.destination_label,
      'cities', t.cities,
      'countries', t.countries,
      'notes', t.notes
    ),
    'track', pts,
    'media', media,
    'geo_shared', t.share_include_geo,
    'expires_at', t.share_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.havkar_resolve_trip_share(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.havkar_resolve_trip_share(text) TO anon, authenticated;

COMMENT ON FUNCTION public.havkar_resolve_trip_share(text) IS
  'Resolves opt-in shared trips only. Private trips never returned. Exact media geo requires share_include_geo.';
