-- Defense in depth: travel-life tables are private; revoke anon entirely.
-- Matches existing HAVKAR pattern (wallet/messages/event_tickets).
-- Production already applied as travel_life_revoke_anon after Owner merge of #287.

REVOKE ALL ON TABLE public.user_trips FROM anon;
REVOKE ALL ON TABLE public.trip_stops FROM anon;
REVOKE ALL ON TABLE public.trip_track_points FROM anon;
REVOKE ALL ON TABLE public.trip_albums FROM anon;
REVOKE ALL ON TABLE public.trip_media FROM anon;
REVOKE ALL ON TABLE public.user_reminder_prefs FROM anon;
REVOKE ALL ON TABLE public.user_saved_places FROM anon;
REVOKE ALL ON TABLE public.user_saved_cameras FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_trips FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.trip_stops FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.trip_track_points FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.trip_albums FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.trip_media FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_reminder_prefs FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_saved_places FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_saved_cameras FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_trips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_stops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_track_points TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_albums TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_reminder_prefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_saved_places TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_saved_cameras TO authenticated;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='trip_track_points_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.trip_track_points_id_seq FROM anon;
    GRANT USAGE, SELECT ON SEQUENCE public.trip_track_points_id_seq TO authenticated;
  END IF;
END $$;
