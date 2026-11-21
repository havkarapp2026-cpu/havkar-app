-- Listing/display currencies on ads: allow any ISO 4217 text (133 presentment codes).
-- XLM remains a separate crypto rail and is not stored as ads.currency fiat.
-- Settlement / live Stripe charging stays Owner-gated elsewhere — this only stores quotation currency.
ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_currency_check;

ALTER TABLE public.ads
  DROP CONSTRAINT IF EXISTS ads_currency_iso_format;

ALTER TABLE public.ads
  ADD CONSTRAINT ads_currency_iso_format
  CHECK (
    currency IS NULL
    OR (
      length(btrim(currency)) = 3
      AND currency = upper(btrim(currency))
      AND currency ~ '^[A-Z]{3}$'
      AND currency <> 'XLM'
    )
  );
