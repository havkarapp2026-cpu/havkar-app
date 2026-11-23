-- Allow Stripe-collected commission state after verified Connect destination charge.
-- Preserve trigger-created liability rows; do not overwrite Stripe-linked ledger.

ALTER TABLE public.service_commission_entries
  DROP CONSTRAINT IF EXISTS service_commission_entries_collection_check;

ALTER TABLE public.service_commission_entries
  ADD CONSTRAINT service_commission_entries_collection_check
  CHECK (
    collection_state = ANY (
      ARRAY[
        'uncollected'::text,
        'collected_stripe'::text,
        'collected_cash'::text,
        'void'::text
      ]
    )
  );

CREATE OR REPLACE FUNCTION havkar_private.record_service_commission_liability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cents integer;
  channel text;
  liability text;
BEGIN
  IF NEW.agreed_price IS NULL OR NEW.currency IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.agreed_price < 0 OR NEW.agreed_price > 1000000 THEN
    RAISE EXCEPTION 'service price cannot be commissioned'
      USING ERRCODE = '42501';
  END IF;

  cents := round(NEW.agreed_price * 100)::integer;

  IF cents < 0 OR cents > 100000000 THEN
    RAISE EXCEPTION 'service price cannot be commissioned'
      USING ERRCODE = '42501';
  END IF;

  channel := CASE NEW.payment_method
    WHEN 'cash' THEN 'cash'
    WHEN 'online' THEN 'online'
    ELSE 'manual'
  END;

  liability := CASE
    WHEN NEW.status IN ('cancelled', 'declined') THEN 'void'
    WHEN NEW.status = 'completed' THEN 'owed'
    ELSE 'recorded'
  END;

  INSERT INTO public.service_commission_entries (
    booking_id,
    agreed_amount_cents,
    currency,
    customer_charge_cents,
    commission_bps,
    commission_cents,
    provider_settlement_cents,
    payer,
    settlement_channel,
    liability_state,
    collection_state,
    processing_fee_cents,
    tax_cents
  ) VALUES (
    NEW.id,
    cents,
    NEW.currency,
    cents,
    1000,
    0,
    0,
    'provider',
    channel,
    liability,
    'uncollected',
    0,
    0
  )
  ON CONFLICT (booking_id) DO UPDATE
  SET
    liability_state = CASE
      WHEN public.service_commission_entries.stripe_event_id IS NOT NULL
        THEN public.service_commission_entries.liability_state
      WHEN public.service_commission_entries.collection_state = 'collected_stripe'
        THEN public.service_commission_entries.liability_state
      ELSE EXCLUDED.liability_state
    END;

  RETURN NEW;
END;
$function$;
