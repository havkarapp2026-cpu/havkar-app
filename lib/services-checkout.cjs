/*
 * Services Stripe Connect destination Checkout (10% provider commission).
 * Customer pays agreed list price only. No buyer surcharge.
 * Reuses Connect accounts from marketplace_seller_connect_accounts when present.
 */

const serviceCommerce = require("../havkar-service-commerce.js");
const { cardPaymentsAllowed } = require("./real-payments.cjs");

const SERVICES_LIVE_FLAG = "HAVKAR_SERVICE_PAYMENTS_ENABLED";

function servicesPaymentsArmed(env = process.env) {
  return (
    cardPaymentsAllowed(env) &&
    String(env[SERVICES_LIVE_FLAG] || "") === "true"
  );
}

function buildServicesDestinationCheckoutParams({
  amountCents,
  applicationFeeCents,
  connectedAccountId,
  currency = "eur",
  serviceTitle,
  successUrl,
  cancelUrl,
  customerEmail,
  metadata = {}
}) {
  if (
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    !Number.isInteger(applicationFeeCents) ||
    applicationFeeCents < 0 ||
    applicationFeeCents >= amountCents ||
    !connectedAccountId
  ) {
    throw new Error("Invalid services destination checkout parameters");
  }
  return {
    mode: "payment",
    customer_email: customerEmail || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: String(currency).toLowerCase(),
          unit_amount: amountCents,
          product_data: {
            name: serviceTitle || "HAVKAR service booking",
            description:
              "Customer pays the agreed service price. Provider settlement retains HAVKAR 10% application fee. Processing fees and taxes are separate."
          }
        }
      }
    ],
    payment_intent_data: {
      application_fee_amount: applicationFeeCents,
      transfer_data: {
        destination: connectedAccountId
      },
      metadata: {
        ...metadata,
        havkar_flow: "services"
      }
    },
    metadata: {
      ...metadata,
      havkar_flow: "services",
      connected_account_id: connectedAccountId
    },
    success_url: successUrl,
    cancel_url: cancelUrl
  };
}

async function resolveServiceProviderConnectAccount(supabase, providerUserId) {
  const uid = String(providerUserId || "").trim();
  if (!uid) return { ok: false, reason: "missing_provider" };

  const marketplace = await supabase
    .from("marketplace_seller_connect_accounts")
    .select(
      "stripe_account_id,charges_enabled,payouts_enabled,onboarding_status,user_id"
    )
    .eq("user_id", uid)
    .maybeSingle();
  if (marketplace.error) {
    return { ok: false, reason: "marketplace_connect_lookup_failed" };
  }

  let profile = await supabase
    .from("service_provider_profiles")
    .select(
      "user_id,stripe_account_id,verification_status,display_name,service_area"
    )
    .eq("user_id", uid)
    .maybeSingle();
  if (profile.error) {
    return { ok: false, reason: "provider_profile_lookup_failed" };
  }

  const marketAccount =
    marketplace.data && marketplace.data.stripe_account_id
      ? marketplace.data
      : null;

  if (marketAccount && marketAccount.charges_enabled === true) {
    if (
      !profile.data ||
      String(profile.data.stripe_account_id || "") !==
        String(marketAccount.stripe_account_id)
    ) {
      const upsert = {
        user_id: uid,
        stripe_account_id: marketAccount.stripe_account_id,
        verification_status:
          (profile.data && profile.data.verification_status) || "unverified",
        updated_at: new Date().toISOString()
      };
      if (!profile.data) {
        upsert.display_name = "HAVKAR provider";
        upsert.created_at = new Date().toISOString();
      }
      await supabase.from("service_provider_profiles").upsert(upsert, {
        onConflict: "user_id"
      });
      profile = await supabase
        .from("service_provider_profiles")
        .select(
          "user_id,stripe_account_id,verification_status,display_name,service_area"
        )
        .eq("user_id", uid)
        .maybeSingle();
    }
    return {
      ok: true,
      stripe_account_id: marketAccount.stripe_account_id,
      charges_enabled: true,
      payouts_enabled: marketAccount.payouts_enabled === true,
      onboarding_status: marketAccount.onboarding_status || "complete",
      provider_verified: true,
      source: "marketplace_seller_connect_accounts",
      profile: profile.data || null
    };
  }

  const profileAccount =
    profile.data && profile.data.stripe_account_id
      ? String(profile.data.stripe_account_id)
      : "";
  if (profileAccount && marketAccount) {
    return {
      ok: false,
      reason: "provider_connect_incomplete",
      stripe_account_id: profileAccount || marketAccount.stripe_account_id,
      charges_enabled: false,
      payouts_enabled: false,
      onboarding_status: marketAccount.onboarding_status || "pending",
      provider_verified: false,
      source: "marketplace_seller_connect_accounts"
    };
  }

  return {
    ok: false,
    reason: "provider_not_ready",
    stripe_account_id: profileAccount || null,
    charges_enabled: false,
    payouts_enabled: false,
    onboarding_status: "missing",
    provider_verified: false,
    source: null
  };
}

function decideServicesCheckout(env, input) {
  if (!servicesPaymentsArmed(env)) {
    return {
      status: 503,
      callStripe: false,
      code: "service_payments_disabled",
      error:
        "Service card payments are not armed. No charge was created."
    };
  }
  return serviceCommerce.onlineCheckoutDecision(env, input);
}

module.exports = {
  SERVICES_LIVE_FLAG,
  servicesPaymentsArmed,
  buildServicesDestinationCheckoutParams,
  resolveServiceProviderConnectAccount,
  decideServicesCheckout
};
