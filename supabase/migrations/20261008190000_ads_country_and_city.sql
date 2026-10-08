-- Optional country and city for Buy & Sell advertisements.
-- Existing advertisements are not inserted, updated, or deleted.
-- Existing RLS policies and triggers are unchanged.
-- Both columns are nullable and have no default, so current rows
-- keep country_code and city as NULL.

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS country_code text;

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS city text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ads_country_code_iso_format'
      AND conrelid = 'public.ads'::regclass
  ) THEN
    ALTER TABLE public.ads
      ADD CONSTRAINT ads_country_code_iso_format
      CHECK (
        country_code IS NULL
        OR country_code ~ '^[A-Z]{2}$'
      );
  END IF;
END $$;
