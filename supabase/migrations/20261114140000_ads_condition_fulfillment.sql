-- Marketplace listing attributes for filters and fulfillment options.
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS fulfillment_mode text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ads_condition_check'
  ) THEN
    ALTER TABLE public.ads
      ADD CONSTRAINT ads_condition_check
      CHECK (condition IS NULL OR condition = ANY (ARRAY['new'::text, 'used'::text, 'refurbished'::text]));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ads_fulfillment_mode_check'
  ) THEN
    ALTER TABLE public.ads
      ADD CONSTRAINT ads_fulfillment_mode_check
      CHECK (fulfillment_mode IS NULL OR fulfillment_mode = ANY (ARRAY['delivery'::text, 'pickup'::text, 'both'::text]));
  END IF;
END $$;

COMMENT ON COLUMN public.ads.condition IS 'Marketplace item condition: new, used, or refurbished.';
COMMENT ON COLUMN public.ads.fulfillment_mode IS 'Marketplace fulfillment: delivery, pickup, or both.';
