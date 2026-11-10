/*
 * Transparent fee examples for HAVKAR revenue streams.
 * Stripe card fee formula is an ESTIMATE for EU consumer cards
 * (1.5% + €0.25) unless overridden — not a live Stripe quote.
 * Marketplace/service rates are the approved HAVKAR business rules.
 */

const BUYER_FEE_RATE = 0.02;
const SELLER_FEE_RATE = 0.03;
const SERVICE_COMMISSION_RATE = 0.1;
const STRIPE_PERCENT_ESTIMATE = 0.015;
const STRIPE_FIXED_EUR_ESTIMATE = 0.25;

function roundCents(euros) {
  return Math.round(Number(euros) * 100) / 100;
}

function stripeFeeEstimateEur(grossChargedEur) {
  const fee = grossChargedEur * STRIPE_PERCENT_ESTIMATE + STRIPE_FIXED_EUR_ESTIMATE;
  return roundCents(fee);
}

function marketplaceExample(listPriceEur) {
  const list = roundCents(listPriceEur);
  const buyerFee = roundCents(list * BUYER_FEE_RATE);
  const sellerFee = roundCents(list * SELLER_FEE_RATE);
  const buyerPays = roundCents(list + buyerFee);
  const sellerReceives = roundCents(list - sellerFee);
  const platformGross = roundCents(buyerFee + sellerFee);
  const stripeFee = stripeFeeEstimateEur(buyerPays);
  const platformNetAfterStripe = roundCents(platformGross - stripeFee);
  return {
    flow: "buy_sell",
    list_price_eur: list,
    buyer_fee_eur: buyerFee,
    seller_fee_eur: sellerFee,
    buyer_pays_eur: buyerPays,
    seller_receives_eur: sellerReceives,
    platform_commission_eur: platformGross,
    stripe_fee_estimate_eur: stripeFee,
    platform_net_after_stripe_estimate_eur: platformNetAfterStripe,
    economically_viable_estimate: platformNetAfterStripe > 0,
    stripe_connect_used: false,
    notes:
      "Marketplace Stripe Checkout/Connect is NOT implemented. Figures are rule math + fee estimate only."
  };
}

function serviceCommissionExample(agreedPriceEur) {
  const agreed = roundCents(agreedPriceEur);
  const commission = roundCents(agreed * SERVICE_COMMISSION_RATE);
  const providerKeeps = roundCents(agreed - commission);
  return {
    flow: "services",
    agreed_price_eur: agreed,
    commission_eur: commission,
    provider_settlement_eur: providerKeeps,
    collection_state_in_code: "uncollected",
    automatic_debit: false,
    notes:
      "Ledger records liability only. collection_state cannot leave uncollected via automatic Stripe debit."
  };
}

function platformCommissionOnlyExamples(commissionAmountsEur) {
  return commissionAmountsEur.map((amount) => {
    const commission = roundCents(amount);
    const stripeIfCollectedAsSeparateCharge = stripeFeeEstimateEur(commission);
    const netIfSeparateCharge = roundCents(
      commission - stripeIfCollectedAsSeparateCharge
    );
    return {
      commission_eur: commission,
      if_already_inside_platform_checkout_gross: {
        enters_havkar_stripe_balance: true,
        stripe_fee_paid_from: "HAVKAR platform balance (estimate)",
        available_vs_pending: "Stripe pending then available per card settlement; payouts are MANUAL on live account",
        minimum_payout: "Not observed as a fixed API minimum; schedule=manual so owner initiates",
        bank: "REVOLUT PAYMENTS UAB last4 8455 status=new (default EUR; not forced verified)"
      },
      if_collected_as_standalone_charge_of_same_amount: {
        stripe_fee_estimate_eur: stripeIfCollectedAsSeparateCharge,
        net_estimate_eur: netIfSeparateCharge,
        economically_viable_estimate: netIfSeparateCharge > 0
      }
    };
  });
}

function eventTicketExample(ticketPriceEur) {
  const price = roundCents(ticketPriceEur);
  const stripeFee = stripeFeeEstimateEur(price);
  return {
    flow: "events_stripe_checkout",
    buyer_pays_eur: price,
    recipient: "HAVKAR live Stripe account (no Connect destination)",
    stripe_objects: ["checkout.session", "payment_intent", "charge"],
    code_path: "api/create-event-checkout.js → checkout.sessions.create; api/stripe-webhook.js checkout.session.completed",
    stripe_fee_estimate_eur: stripeFee,
    platform_net_estimate_eur: roundCents(price - stripeFee),
    application_fee: null,
    connect: false
  };
}

module.exports = {
  BUYER_FEE_RATE,
  SELLER_FEE_RATE,
  SERVICE_COMMISSION_RATE,
  STRIPE_PERCENT_ESTIMATE,
  STRIPE_FIXED_EUR_ESTIMATE,
  marketplaceExample,
  serviceCommissionExample,
  platformCommissionOnlyExamples,
  eventTicketExample,
  stripeFeeEstimateEur
};
