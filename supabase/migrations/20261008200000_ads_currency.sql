-- Optional ISO 4217 currency for Buy & Sell advertisements.
-- Existing advertisements are not inserted, updated, or deleted.
-- Existing RLS policies and triggers are unchanged.
-- The column is nullable and has no default, so current rows
-- keep currency as NULL instead of assuming EUR.

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS currency text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ads_currency_iso_4217'
      AND conrelid = 'public.ads'::regclass
  ) THEN
    ALTER TABLE public.ads
      ADD CONSTRAINT ads_currency_iso_4217
      CHECK (
        currency IS NULL
        OR currency IN (
          'AED',
          'AUD',
          'BRL',
          'CAD',
          'CHF',
          'CNY',
          'DKK',
          'EUR',
          'GBP',
          'INR',
          'IQD',
          'IRR',
          'JPY',
          'NOK',
          'RUB',
          'SAR',
          'SEK',
          'TRY',
          'USD'
        )
      );
  END IF;
END $$;
