"use strict";

/*
 * Staging-only Stripe Connect sandbox E2E.
 * Creates a recipient account, Account Link (onboarding redirect), and a
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
  buildRecipientAccountV2CreateBody,
  buildMarketplaceDestinationCheckoutParams
} = require("./marketplace-connect.cjs");

async function createSandboxSellerAccount(stripe) {
  let created;
  let path = "v2";
  try {
    created = await stripe.request({
      method: "POST",
      path: "/v2/core/accounts",
      body: buildRecipientAccountV2CreateBody({
        email: "connect-e2e@havkar.online",
        country: "IT",
        displayName: "HAVKAR Connect E2E seller"
      })
    });
  } catch (_v2Error) {
    path = "v1_controller";
    created = await stripe.accounts.create({
      controller: {
        stripe_dashboard: { type: "express" },
        fees: { payer: "application" },
        losses: { payments: "application" }
      },
      capabilities: {
        transfers: { requested: true }
      },
      email: "connect-e2e@havkar.online",
      metadata: {
        havkar_flow: "marketplace_connect",
        havkar_env: "staging_e2e"
      }
    });
  }
  return { account: created, path };
}

async function runConnectOnboardE2e(env = process.env) {
  const resolved = await resolveSandboxStripe(env);
  if (!resolved.ok) return resolved;
  const { stripe, accountId } = resolved;

  const { account, path } = await createSandboxSellerAccount(stripe);
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

  const accountLink = await stripe.accountLinks.create({
    account: connectedAccountId,
    refresh_url: "https://staging.havkar.online/market.html?connect=refresh",
    return_url: "https://staging.havkar.online/market.html?connect=return",
    type: "account_onboarding"
  });

  let retrieved;
  try {
    retrieved = await stripe.accounts.retrieve(connectedAccountId);
  } catch (_err) {
    retrieved = account;
  }

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

  const chargesEnabled = retrieved && retrieved.charges_enabled === true;
  const payoutsEnabled = retrieved && retrieved.payouts_enabled === true;
  const detailsSubmitted = retrieved && retrieved.details_submitted === true;
  const destinationOk =
    destinationIntent && destinationIntent.status === "succeeded";

  // Onboarding redirect + fee split always must work. Destination charge may
  // remain restricted until seller KYC completes — report that honestly.
  const ok = Boolean(accountLink && accountLink.url && split && connectedAccountId);

  return {
    ok,
    httpStatus: ok ? 200 : 502,
    scenario: "connect_onboard",
    livemode: false,
    platform_stripe_account_id: accountId,
    connected_account_id: connectedAccountId,
    account_create_path: path,
    onboarding_url_present: Boolean(accountLink && accountLink.url),
    onboarding_url_host: accountLink && accountLink.url
      ? String(new URL(accountLink.url).host)
      : null,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    details_submitted: detailsSubmitted,
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
    seller_kyc_complete: chargesEnabled && detailsSubmitted,
    note: destinationOk
      ? "Connect account + destination charge succeeded with 2%/3% application fee."
      : "Connect account + Account Link created. Destination charge awaits seller KYC (charges_enabled/details_submitted)."
  };
}

module.exports = {
  CONFIRM_PHRASE,
  runConnectOnboardE2e
};
