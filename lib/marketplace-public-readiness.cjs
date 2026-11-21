/*
 * Buy & Sell public-readiness inventory.
 * Never invents bank details, secret keys, or webhook signing secrets.
 * Reports only what code + non-secret env flags allow.
 */

const {
  BUYER_FEE_RATE,
  SELLER_FEE_RATE,
  marketplaceExample
} = require("./havkar-fee-examples.cjs");
const {
  realPaymentsEnabled,
  cardPaymentsAllowed,
  stripeTestCheckoutAllowed
} = require("./real-payments.cjs");
const {
  mainnetCustomerLiveReady
} = require("./stellar-mainnet.cjs");
const {
  REQUIRED_WEBHOOK_EVENTS
} = require("./stripe-webhook-processor.cjs");

function flagTrue(env, name) {
  return String((env || process.env)[name] || "") === "true";
}

function marketplacePublicLivePaymentsAllowed(env = process.env) {
  return flagTrue(env, "HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS");
}

function presentSecretPresence(env = process.env) {
  return {
    STRIPE_SECRET_KEY_present: Boolean(env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET_present: Boolean(env.STRIPE_WEBHOOK_SECRET),
    STRIPE_PUBLISHABLE_KEY_present: Boolean(
      env.STRIPE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ),
    SUPABASE_SERVICE_ROLE_present: Boolean(
      env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
    ),
    note:
      "Presence only. Values are never returned. Missing secrets must be filled by Owner in Vercel/Supabase — never invented."
  };
}

function feeRules() {
  const example = marketplaceExample(100);
  return {
    buyer_fee_rate: BUYER_FEE_RATE,
    seller_fee_rate: SELLER_FEE_RATE,
    platform_commission_rate: BUYER_FEE_RATE + SELLER_FEE_RATE,
    example_list_eur_100: example,
    enforcement:
      "Server-side marketplaceCardSplit + quoteWithFees; listing price loaded from ads, not client-trusted."
  };
}

function buildMarketplacePublicReadiness(env = process.env, extras = {}) {
  const publicLive = marketplacePublicLivePaymentsAllowed(env);
  const cards = cardPaymentsAllowed(env);
  const testCheckout = stripeTestCheckoutAllowed(env);
  const xlmLive = mainnetCustomerLiveReady(env);
  const secrets = presentSecretPresence(env);

  const blockers = [];
  if (!publicLive) {
    blockers.push({
      code: "MARKETPLACE_PUBLIC_LIVE_OFF",
      message:
        "HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS is not true. Public Buy Now card charges stay closed."
    });
  }
  if (!cards) {
    blockers.push({
      code: "CARD_COLLECTION_PAUSED",
      message:
        "cardPaymentsAllowed() is false (HAVKAR_REAL_PAYMENTS_ENABLED / Stripe live flags)."
    });
  }
  if (!secrets.STRIPE_SECRET_KEY_present) {
    blockers.push({
      code: "STRIPE_SECRET_MISSING",
      message: "STRIPE_SECRET_KEY is not present in this runtime."
    });
  }
  if (!secrets.STRIPE_WEBHOOK_SECRET_present) {
    blockers.push({
      code: "STRIPE_WEBHOOK_SECRET_MISSING",
      message: "STRIPE_WEBHOOK_SECRET is not present in this runtime."
    });
  }
  if (
    extras.connect_sellers_ready != null &&
    Number(extras.connect_sellers_ready) <= 0
  ) {
    blockers.push({
      code: "NO_SELLER_CONNECT_READY",
      message:
        "No marketplace seller Connect account with charges_enabled=true was observed."
    });
  }

  return {
    ok: true,
    module: "buy_sell",
    generated_at: new Date().toISOString(),
    fees: feeRules(),
    gates: {
      HAVKAR_REAL_PAYMENTS_ENABLED: flagTrue(env, "HAVKAR_REAL_PAYMENTS_ENABLED"),
      HAVKAR_STRIPE_LIVE_ENABLED: flagTrue(env, "HAVKAR_STRIPE_LIVE_ENABLED"),
      HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS: publicLive,
      HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED: flagTrue(
        env,
        "HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED"
      ),
      HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: flagTrue(
        env,
        "HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED"
      ),
      HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: flagTrue(
        env,
        "HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION"
      ),
      HAVKAR_XLM_ALLOW_PLATFORM_COLLECT: flagTrue(
        env,
        "HAVKAR_XLM_ALLOW_PLATFORM_COLLECT"
      )
    },
    capabilities: {
      card_collection_allowed: cards,
      marketplace_public_live: publicLive,
      stripe_test_checkout_allowed: testCheckout,
      stellar_mainnet_customer_live: xlmLive,
      xlm_direct_split_preferred: true,
      xlm_platform_collect_default: false,
      webhook_events_required: REQUIRED_WEBHOOK_EVENTS.slice()
    },
    secrets: secrets,
    legal_and_ops_checklist: [
      "Owner KYB / Stripe Connect Express onboarding for sellers before live destination charges",
      "Confirm webhook endpoint https://havkar.online/api/stripe-webhook receives REQUIRED_WEBHOOK_EVENTS",
      "Confirm live vs test Stripe accounts are not mixed for customer charges",
      "Confirm Stellar Mainnet receive accounts are Owner-verified public keys only (no seeds in DB)",
      "Privacy/terms pages cover marketplace purchases, fees (2%/3%), refunds, and disputes",
      "Owner must approve before enabling HAVKAR_MARKETPLACE_PUBLIC_LIVE_PAYMENTS=true"
    ],
    observed: {
      connect_sellers: extras.connect_sellers == null ? null : Number(extras.connect_sellers),
      connect_sellers_ready:
        extras.connect_sellers_ready == null
          ? null
          : Number(extras.connect_sellers_ready),
      marketplace_ads: extras.marketplace_ads == null ? null : Number(extras.marketplace_ads),
      active_ads: extras.active_ads == null ? null : Number(extras.active_ads),
      xlm_intents: extras.xlm_intents == null ? null : Number(extras.xlm_intents),
      likely_test_listings:
        extras.likely_test_listings == null
          ? null
          : Number(extras.likely_test_listings)
    },
    blockers,
    ready_for_owner_live_activation: blockers.length === 0,
    real_charges_created_by_this_report: false
  };
}

module.exports = {
  buildMarketplacePublicReadiness,
  marketplacePublicLivePaymentsAllowed,
  feeRules,
  presentSecretPresence
};
