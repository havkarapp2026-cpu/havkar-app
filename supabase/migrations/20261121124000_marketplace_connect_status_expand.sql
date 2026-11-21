-- Allow richer Connect onboarding statuses after Stripe Live KYC.
-- pending_verification: details submitted, Stripe still reviewing (e.g. sanctions).
-- submitted: details submitted, charges may already be enabled while payouts wait.

alter table public.marketplace_seller_connect_accounts
  drop constraint if exists marketplace_seller_connect_onboarding_status_check;

alter table public.marketplace_seller_connect_accounts
  add constraint marketplace_seller_connect_onboarding_status_check
  check (
    onboarding_status = any (
      array[
        'pending'::text,
        'submitted'::text,
        'pending_verification'::text,
        'restricted'::text,
        'complete'::text,
        'disabled'::text
      ]
    )
  );
