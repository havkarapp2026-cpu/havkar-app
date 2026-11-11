-- Ensure advertising schema parity for environments that missed
-- 20261008190000_ads_country_and_city.sql (safe IF NOT EXISTS).
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS country_code text;

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS city text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ads_country_code_iso_format'
  ) THEN
    ALTER TABLE public.ads
      ADD CONSTRAINT ads_country_code_iso_format
      CHECK (
        country_code IS NULL
        OR country_code ~ '^[A-Z]{2}$'
      );
  END IF;
END $$;
