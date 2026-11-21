-- Listing/display currencies on services: allow any ISO 4217 text (133 presentment codes).
-- XLM remains a separate crypto rail and is not stored as services.currency fiat.
-- Provider commission settlement stays Owner-gated / EUR-oriented elsewhere — this only stores quotation currency.
ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_currency_check;

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_currency_iso_format;

ALTER TABLE public.services
  ADD CONSTRAINT services_currency_iso_format
  CHECK (
    currency IS NULL
    OR (
      length(btrim(currency)) = 3
      AND currency = upper(btrim(currency))
      AND currency ~ '^[A-Z]{3}$'
      AND currency <> 'XLM'
    )
  );
