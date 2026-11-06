-- One Buy & Sell video may last up to 60 seconds.
-- The private marketplace-media bucket remains 15 MiB, MP4 or WebM only.
-- HAVKAR does not transcode the file. Advertising rows and payments are unchanged.

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_video_duration_check;

ALTER TABLE public.ads
  ADD CONSTRAINT ads_video_duration_check
  CHECK (
    video_duration_seconds IS NULL
    OR (
      video_duration_seconds > 0
      AND video_duration_seconds <= 60
    )
  );
