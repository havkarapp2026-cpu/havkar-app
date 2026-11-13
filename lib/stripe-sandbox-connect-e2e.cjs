"use strict";

/*
 * Staging-only Stripe Connect sandbox E2E.
 * Creates an Accounts v2 recipient, Account Link (onboarding redirect), and a
 * destination PaymentIntent with HAVKAR 2%/3% application fee.
 * Never uses raw PANs / Charges / tokens. Never live money.
 */

const {
  resolveSandboxStripe,
  CONFIRM_PHRASE,
  STAGING_WEBHOOK_ID,
  EXPECTED_SANDBOX_ACCOUNT_ID
} = require("./stripe-sandbox-payment-e2e.cjs");
const {
  marketplaceCardSplit,
  buildMarketplaceDestinationCheckoutParams,
  createRecipientAccountV2,
  createRecipientAccountOnboardingLink,
  connectAccountFlagsFromV2
} = require("./marketplace-connect.cjs");

async function runConnectOnboardE2e(env = process.env) {
  const resolved = await resolveSandboxStripe(env);
  if (!resolved.ok) return resolved;
  const { stripe, accountId } = resolved;

  let account;
  try {
    // Express + application responsibilities: platform cannot accept TOS on
    // behalf of the seller (tos_acceptance_on_behalf_not_allowed). Seller
    // accepts via Account Link hosted onboarding instead.
    account = await createRecipientAccountV2(stripe, {
      email: "connect-e2e@havkar.online",
      country: "IT",
      displayName: "HAVKAR Connect E2E seller",
      entityType: "individual",
      acceptTos: false
    });
  } catch (err) {
    return {
      ok: false,
      httpStatus: 502,
      code: "CONNECT_ACCOUNT_V2_CREATE_FAILED",
      scenario: "connect_onboard",
      livemode: false,
      stripe_account_id: accountId,
      error: err && err.message ? String(err.message).slice(0, 280) : "v2_create_failed",
      stripe_error_code: err && err.code ? String(err.code) : null
    };
  }

  const connectedAccountId = String(account.id || "");
  if (!connectedAccountId) {
    return {
      ok: false,
      httpStatus: 502,
      code: "CONNECT_ACCOUNT_MISSING_ID",
      scenario: "connect_onboard",
      livemode: false,
      stripe_account_id: accountId
    };
  }

  let accountLink;
  try {
    accountLink = await createRecipientAccountOnboardingLink(stripe, {
      accountId: connectedAccountId,
      refreshUrl: "https://staging.havkar.online/market.html?connect=refresh",
      returnUrl: "https://staging.havkar.online/market.html?connect=return"
    });
  } catch (err) {
    return {
      ok: false,
      httpStatus: 502,
      code: "CONNECT_ACCOUNT_LINK_FAILED",
      scenario: "connect_onboard",
      livemode: false,
      stripe_account_id: accountId,
      connected_account_id: connectedAccountId,
      error: err && err.message ? String(err.message).slice(0, 280) : "account_link_failed",
      stripe_error_code: err && err.code ? String(err.code) : null
    };
  }

  let retrieved = account;
  try {
    retrieved = await stripe.v2.core.accounts.retrieve(connectedAccountId, {
      include: ["configuration.recipient", "identity", "requirements"]
    });
  } catch (_err) {
    retrieved = account;
  }

  const flags = connectAccountFlagsFromV2(retrieved);
  const split = marketplaceCardSplit(100);
  const exampleCheckout = buildMarketplaceDestinationCheckoutParams({
    split,
    connectedAccountId,
    listingTitle: "HAVKAR Connect E2E listing",
    successUrl: "https://staging.havkar.online/market.html?payment=success",
    cancelUrl: "https://staging.havkar.online/market.html?payment=cancelled",
    metadata: { havkar_env: "staging_e2e" },
    customerEmail: "buyer-e2e@havkar.online"
  });

  let destinationIntent = null;
  let destinationError = null;
  try {
    destinationIntent = await stripe.paymentIntents.create({
      amount: split.buyer_pays_cents,
      currency: "eur",
      confirm: true,
      payment_method: "pm_card_visa",
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      application_fee_amount: split.application_fee_cents,
      transfer_data: { destination: connectedAccountId },
      metadata: {
        havkar_flow: "marketplace",
        havkar_env: "staging_e2e",
        platform_commission_eur: String(split.platform_commission_eur)
      }
    });
  } catch (err) {
    destinationError = {
      type: err && err.type ? String(err.type) : null,
      code: err && err.code ? String(err.code) : null,
      message: err && err.message ? String(err.message).slice(0, 240) : "destination_charge_failed"
    };
  }

  const destinationOk =
    destinationIntent && destinationIntent.status === "succeeded";
  const onboardingUrl =
    (accountLink && (accountLink.url || accountLink.link)) || null;
  const ok = Boolean(onboardingUrl && split && connectedAccountId);

  return {
    ok,
    httpStatus: ok ? 200 : 502,
    scenario: "connect_onboard",
    livemode: false,
    platform_stripe_account_id: accountId,
    connected_account_id: connectedAccountId,
    account_create_path: "v2.core.accounts",
    onboarding_url_present: Boolean(onboardingUrl),
    onboarding_url_host: onboardingUrl ? String(new URL(onboardingUrl).host) : null,
    charges_enabled: flags.charges_enabled,
    payouts_enabled: flags.payouts_enabled,
    details_submitted: flags.details_submitted,
    transfer_capability_status: flags.transfer_capability_status,
    fee_split: split,
    destination_checkout_example_ok: Boolean(exampleCheckout),
    destination_payment_intent_id: destinationIntent
      ? destinationIntent.id
      : null,
    destination_payment_intent_status: destinationIntent
      ? destinationIntent.status
      : null,
    destination_charge_ok: Boolean(destinationOk),
    destination_error: destinationError,
    webhook_destination_id: STAGING_WEBHOOK_ID,
    expected_sandbox_account_id: EXPECTED_SANDBOX_ACCOUNT_ID,
    seller_kyc_complete: flags.charges_enabled && flags.details_submitted,
    note: destinationOk
      ? "Connect Accounts v2 + destination charge succeeded with 2%/3% application fee."
      : "Connect Accounts v2 + Account Link created. Destination charge awaits seller onboarding/KYC."
  };
}

module.exports = {
  CONFIRM_PHRASE,
  runConnectOnboardE2e
};
