-- Safe marketplace shipping + condition metadata.
-- Does not delete rows. Only fills NULL marketplace fields.
-- shipping_option is the Buy & Sell shipping filter column.
-- fulfillment_mode (legacy) stays intact; values are mirrored when present.

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS shipping_option text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ads_shipping_option_check'
      AND conrelid = 'public.ads'::regclass
  ) THEN
    ALTER TABLE public.ads
      ADD CONSTRAINT ads_shipping_option_check
      CHECK (
        shipping_option IS NULL
        OR shipping_option = ANY (
          ARRAY[
            'pickup'::text,
            'shipping'::text,
            'both'::text,
            'unspecified'::text
          ]
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.ads.shipping_option IS
  'Marketplace shipping filter: pickup | shipping | both | unspecified';

-- Expand condition check to allow honest unspecified without inventing new/used.
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_condition_check;
ALTER TABLE public.ads
  ADD CONSTRAINT ads_condition_check
  CHECK (
    condition IS NULL
    OR condition = ANY (
      ARRAY[
        'new'::text,
        'used'::text,
        'refurbished'::text,
        'unspecified'::text
      ]
    )
  );

-- Mirror legacy fulfillment_mode into shipping_option when shipping is still null.
UPDATE public.ads
SET shipping_option = CASE
  WHEN fulfillment_mode = 'delivery' THEN 'shipping'
  WHEN fulfillment_mode = 'pickup' THEN 'pickup'
  WHEN fulfillment_mode = 'both' THEN 'both'
  ELSE shipping_option
END
WHERE shipping_option IS NULL
  AND fulfillment_mode IS NOT NULL
  AND listing_surface = 'marketplace';

-- Complete missing marketplace shipping metadata only (no overwrite of set values).
UPDATE public.ads
SET shipping_option = 'unspecified'
WHERE listing_surface = 'marketplace'
  AND shipping_option IS NULL;

-- Complete missing marketplace condition metadata only (no overwrite of set values).
UPDATE public.ads
SET condition = 'unspecified'
WHERE listing_surface = 'marketplace'
  AND condition IS NULL;
