-- HAVKAR Travel Life platform (additive, non-destructive).
-- Private trips / track / albums / reminders / saved places.
-- Owner-only RLS. Staff/admin have NO default read of private trip content.
-- Do NOT apply to production until Owner explicitly approves.

CREATE TABLE IF NOT EXISTS public.user_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled trip',
  trip_type text NOT NULL DEFAULT 'personal_car',
  status text NOT NULL DEFAULT 'planned',
  started_at timestamptz,
  ended_at timestamptz,
  distance_m double precision NOT NULL DEFAULT 0,
  duration_s integer NOT NULL DEFAULT 0,
  origin_label text,
  destination_label text,
  countries text[] NOT NULL DEFAULT '{}',
  cities text[] NOT NULL DEFAULT '{}',
  notes text,
  is_private boolean NOT NULL DEFAULT true,
  share_token text,
  share_expires_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_trips_title_len CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT user_trips_notes_len CHECK (notes IS NULL OR char_length(notes) <= 4000),
  CONSTRAINT user_trips_type_check CHECK (
    trip_type = ANY (ARRAY[
      'personal_car'::text,'flight'::text,'train'::text,'bus'::text,
      'ferry'::text,'taxi'::text,'transfer'::text,'combined'::text,
      'hotel'::text,'walk'::text,'bike'::text,'other'::text
    ])
  ),
  CONSTRAINT user_trips_status_check CHECK (
    status = ANY (ARRAY[
      'planned'::text,'active'::text,'paused'::text,'completed'::text,'cancelled'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS user_trips_user_started_idx
  ON public.user_trips (user_id, started_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS user_trips_user_type_idx
  ON public.user_trips (user_id, trip_type);

ALTER TABLE public.user_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user trips owner all" ON public.user_trips;
CREATE POLICY "user trips owner all"
  ON public.user_trips
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.user_trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  label text,
  lat double precision,
  lng double precision,
  arrived_at timestamptz,
  departed_at timestamptz,
  kind text NOT NULL DEFAULT 'waypoint',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_stops_kind_check CHECK (
    kind = ANY (ARRAY['origin'::text,'waypoint'::text,'pause'::text,'destination'::text])
  ),
  CONSTRAINT trip_stops_lat_range CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90)),
  CONSTRAINT trip_stops_lng_range CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180))
);

CREATE INDEX IF NOT EXISTS trip_stops_trip_seq_idx ON public.trip_stops (trip_id, seq);
ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip stops owner all" ON public.trip_stops;
CREATE POLICY "trip stops owner all"
  ON public.trip_stops
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.trip_track_points (
  id bigserial PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.user_trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision,
  speed_mps double precision,
  heading_deg double precision,
  altitude_m double precision,
  source text NOT NULL DEFAULT 'gps',
  CONSTRAINT trip_track_lat_range CHECK (lat >= -90 AND lat <= 90),
  CONSTRAINT trip_track_lng_range CHECK (lng >= -180 AND lng <= 180)
);

CREATE INDEX IF NOT EXISTS trip_track_trip_time_idx
  ON public.trip_track_points (trip_id, recorded_at);
ALTER TABLE public.trip_track_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip track owner all" ON public.trip_track_points;
CREATE POLICY "trip track owner all"
  ON public.trip_track_points
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.trip_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.user_trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Trip album',
  is_private boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_albums_title_len CHECK (char_length(title) BETWEEN 1 AND 120)
);

ALTER TABLE public.trip_albums ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trip albums owner all" ON public.trip_albums;
CREATE POLICY "trip albums owner all"
  ON public.trip_albums
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.trip_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid REFERENCES public.trip_albums(id) ON DELETE SET NULL,
  trip_id uuid NOT NULL REFERENCES public.user_trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  media_type text NOT NULL,
  mime_type text,
  byte_size integer,
  taken_at timestamptz,
  lat double precision,
  lng double precision,
  caption text,
  is_private boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_media_type_check CHECK (media_type = ANY (ARRAY['photo'::text,'video'::text])),
  CONSTRAINT trip_media_caption_len CHECK (caption IS NULL OR char_length(caption) <= 500),
  CONSTRAINT trip_media_lat_range CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90)),
  CONSTRAINT trip_media_lng_range CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180)),
  CONSTRAINT trip_media_size_check CHECK (byte_size IS NULL OR (byte_size > 0 AND byte_size <= 52428800))
);

CREATE INDEX IF NOT EXISTS trip_media_trip_idx ON public.trip_media (trip_id, taken_at DESC NULLS LAST);
ALTER TABLE public.trip_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trip media owner all" ON public.trip_media;
CREATE POLICY "trip media owner all"
  ON public.trip_media
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_reminder_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_anniversary boolean NOT NULL DEFAULT true,
  yearly_recap boolean NOT NULL DEFAULT true,
  album_memories boolean NOT NULL DEFAULT true,
  birthday_opt_in boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  in_app_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_reminder_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reminder prefs owner all" ON public.user_reminder_prefs;
CREATE POLICY "reminder prefs owner all"
  ON public.user_reminder_prefs
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_saved_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  kind text NOT NULL DEFAULT 'place',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_saved_places_label_len CHECK (char_length(label) BETWEEN 1 AND 120),
  CONSTRAINT user_saved_places_lat_range CHECK (lat >= -90 AND lat <= 90),
  CONSTRAINT user_saved_places_lng_range CHECK (lng >= -180 AND lng <= 180)
);

CREATE INDEX IF NOT EXISTS user_saved_places_user_idx ON public.user_saved_places (user_id, created_at DESC);
ALTER TABLE public.user_saved_places ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saved places owner all" ON public.user_saved_places;
CREATE POLICY "saved places owner all"
  ON public.user_saved_places
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_saved_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  camera_key text NOT NULL,
  label text,
  country text,
  kind text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_saved_cameras_unique UNIQUE (user_id, source_id, camera_key)
);

ALTER TABLE public.user_saved_cameras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saved cameras owner all" ON public.user_saved_cameras;
CREATE POLICY "saved cameras owner all"
  ON public.user_saved_cameras
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Private storage bucket for trip media (signed URLs only; no public listing).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'travel-media',
  'travel-media',
  false,
  52428800,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'video/mp4','video/quicktime','video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "travel media owner read" ON storage.objects;
CREATE POLICY "travel media owner read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'travel-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "travel media owner insert" ON storage.objects;
CREATE POLICY "travel media owner insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'travel-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "travel media owner update" ON storage.objects;
CREATE POLICY "travel media owner update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'travel-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'travel-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "travel media owner delete" ON storage.objects;
CREATE POLICY "travel media owner delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'travel-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMENT ON TABLE public.user_trips IS
  'Private user travel history. Default private. No staff read policy.';
COMMENT ON TABLE public.trip_track_points IS
  'Sampled GPS points for owner trips only. Requires explicit GPS consent in UI.';
COMMENT ON TABLE public.trip_media IS
  'Private trip photos/videos. Exact location publish requires separate share consent.';
COMMENT ON COLUMN public.user_trips.is_private IS
  'Default true. Sharing uses share_token with expiry; never public by default.';
