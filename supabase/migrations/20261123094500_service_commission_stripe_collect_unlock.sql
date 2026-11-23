-- Root cause: enforce_service_commission_entry locked stripe_event_id and
-- forced collection_state='uncollected' on every UPDATE, so verified Stripe
-- fulfillment could never mark the liability row as collected_stripe.
-- Allow Stripe-linked collection updates while still locking amounts after
-- a Stripe event is attached (idempotent replay only).

CREATE OR REPLACE FUNCTION havkar_private.enforce_service_commission_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    /* Identity and currency are immutable. */
    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.payer IS DISTINCT FROM OLD.payer
       OR NEW.processing_fee_cents IS DISTINCT FROM 0
       OR NEW.tax_cents IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'commission amounts are locked'
        USING ERRCODE = '42501';
    END IF;

    /* Once a Stripe event is attached, amounts + event id are immutable
       except idempotent same-event replay. */
    IF OLD.stripe_event_id IS NOT NULL THEN
      IF NEW.stripe_event_id IS DISTINCT FROM OLD.stripe_event_id
         OR NEW.agreed_amount_cents IS DISTINCT FROM OLD.agreed_amount_cents
         OR NEW.customer_charge_cents IS DISTINCT FROM OLD.customer_charge_cents
         OR NEW.commission_bps IS DISTINCT FROM OLD.commission_bps
         OR NEW.commission_cents IS DISTINCT FROM OLD.commission_cents
         OR NEW.provider_settlement_cents IS DISTINCT FROM OLD.provider_settlement_cents THEN
        RAISE EXCEPTION 'commission amounts are locked'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      /* Pre-payment liability row may be completed by verified Stripe webhook:
         attach event id and finalize amounts / collection once. */
      IF NEW.stripe_event_id IS NULL THEN
        /* Still unlinked: only liability_state / channel tweaks allowed;
           monetary fields stay locked unless still placeholder zeros. */
        IF (
             NEW.agreed_amount_cents IS DISTINCT FROM OLD.agreed_amount_cents
          OR NEW.customer_charge_cents IS DISTINCT FROM OLD.customer_charge_cents
          OR NEW.commission_bps IS DISTINCT FROM OLD.commission_bps
          OR NEW.commission_cents IS DISTINCT FROM OLD.commission_cents
          OR NEW.provider_settlement_cents IS DISTINCT FROM OLD.provider_settlement_cents
          OR NEW.settlement_channel IS DISTINCT FROM OLD.settlement_channel
          OR NEW.collection_state IS DISTINCT FROM OLD.collection_state
        ) AND NOT (
          OLD.commission_cents = 0
          AND OLD.provider_settlement_cents = 0
          AND NEW.commission_bps = 1000
          AND (NEW.commission_cents + NEW.provider_settlement_cents) = NEW.agreed_amount_cents
          AND NEW.customer_charge_cents = NEW.agreed_amount_cents
        ) THEN
          RAISE EXCEPTION 'commission amounts are locked'
            USING ERRCODE = '42501';
        END IF;
      ELSE
        /* First Stripe attach: require 1000 bps split integrity. */
        IF NEW.commission_bps IS DISTINCT FROM 1000
           OR NEW.customer_charge_cents IS DISTINCT FROM NEW.agreed_amount_cents
           OR (NEW.commission_cents + NEW.provider_settlement_cents)
              IS DISTINCT FROM NEW.agreed_amount_cents THEN
          RAISE EXCEPTION 'commission amounts are locked'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;

    IF NEW.liability_state NOT IN ('recorded', 'owed', 'void') THEN
      RAISE EXCEPTION 'commission liability state is not available'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.collection_state NOT IN (
      'uncollected', 'collected_stripe', 'collected_cash', 'void'
    ) THEN
      RAISE EXCEPTION 'commission collection state is not available'
        USING ERRCODE = '42501';
    END IF;

    /* collected_stripe requires a Stripe event id. */
    IF NEW.collection_state = 'collected_stripe'
       AND (NEW.stripe_event_id IS NULL OR NEW.stripe_event_id = '') THEN
      RAISE EXCEPTION 'commission amounts are locked'
        USING ERRCODE = '42501';
    END IF;

    NEW.processing_fee_cents := 0;
    NEW.tax_cents := 0;
    RETURN NEW;
  END IF;

  /* INSERT path: compute provider-paid 1000 bps split. */
  NEW.commission_bps := 1000;
  NEW.payer := 'provider';
  NEW.customer_charge_cents := NEW.agreed_amount_cents;
  NEW.commission_cents := round(NEW.agreed_amount_cents * 1000 / 10000.0)::integer;
  NEW.provider_settlement_cents := NEW.agreed_amount_cents - NEW.commission_cents;
  NEW.processing_fee_cents := 0;
  NEW.tax_cents := 0;

  IF NEW.collection_state IS NULL
     OR NEW.collection_state NOT IN (
       'uncollected', 'collected_stripe', 'collected_cash', 'void'
     ) THEN
    NEW.collection_state := 'uncollected';
  END IF;

  /* Insert with Stripe already verified may land as collected_stripe. */
  IF NEW.collection_state = 'collected_stripe'
     AND (NEW.stripe_event_id IS NULL OR NEW.stripe_event_id = '') THEN
    NEW.collection_state := 'uncollected';
  END IF;

  IF NEW.liability_state IS NULL
     OR NEW.liability_state NOT IN ('recorded', 'owed', 'void') THEN
    NEW.liability_state := 'recorded';
  END IF;

  IF NEW.settlement_channel IS NULL
     OR NEW.settlement_channel NOT IN ('online', 'cash', 'manual') THEN
    NEW.settlement_channel := 'manual';
  END IF;

  RETURN NEW;
END;
$function$;
