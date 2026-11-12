/*
 * Buy & Sell Stripe Connect helpers (destination charges).
 * Fee rules: buyer +2%, seller −3% → platform application fee = 5% of list.
 * Does not enable live payments. Account creation uses Accounts v2 payload shape.
 */

const { BUYER_FEE_RATE, SELLER_FEE_RATE } = require("./havkar-fee-examples.cjs");

function roundCents(euros) {
  return Math.round(Number(euros) * 100) / 100;
}

function eurosToCents(euros) {
  return Math.round(roundCents(euros) * 100);
}

function marketplaceCardSplit(listPriceEur) {
  const list = roundCents(listPriceEur);
  if (!Number.isFinite(list) || list <= 0) {
    return null;
  }
  const buyerFee = roundCents(list * BUYER_FEE_RATE);
  const sellerFee = roundCents(list * SELLER_FEE_RATE);
  const buyerPays = roundCents(list + buyerFee);
  const sellerReceives = roundCents(list - sellerFee);
  const platformCommission = roundCents(buyerFee + sellerFee);
  return {
    list_price_eur: list,
    buyer_fee_eur: buyerFee,
    seller_fee_eur: sellerFee,
    buyer_pays_eur: buyerPays,
    seller_receives_eur: sellerReceives,
    platform_commission_eur: platformCommission,
    buyer_pays_cents: eurosToCents(buyerPays),
    application_fee_cents: eurosToCents(platformCommission),
    // Destination charge: charge buyer_pays, retain application_fee, remainder → seller.
    charge_pattern: "destination",
    stripe_connect_used: true
  };
}

function buildRecipientAccountV2CreateBody({
  email,
  country = "IT",
  displayName = "HAVKAR seller",
  entityType = "individual",
  acceptTos = false
} = {}) {
  const identity = {
    country: String(country || "IT").toLowerCase(),
    entity_type: entityType || "individual"
  };
  if (acceptTos) {
    identity.attestations = {
      terms_of_service: {
        account: {
          date: new Date().toISOString(),
          ip: "127.0.0.1"
        }
      }
    };
  }
  return {
    display_name: displayName,
    contact_email: email || undefined,
    dashboard: "express",
    identity,
    defaults: {
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application"
      }
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: {
              requested: true
            }
          }
        }
      }
    },
    metadata: {
      havkar_flow: "marketplace_connect",
      havkar_product: "buy_sell"
    },
    include: ["configuration.recipient", "identity", "defaults", "requirements"]
  };
}

function recipientCapabilityStatus(account) {
  const status =
    account &&
    account.configuration &&
    account.configuration.recipient &&
    account.configuration.recipient.capabilities &&
    account.configuration.recipient.capabilities.stripe_balance &&
    account.configuration.recipient.capabilities.stripe_balance.stripe_transfers &&
    account.configuration.recipient.capabilities.stripe_balance.stripe_transfers
      .status;
  return status ? String(status) : null;
}

function connectAccountFlagsFromV2(account) {
  const transferStatus = recipientCapabilityStatus(account);
  const chargesEnabled =
    account && account.charges_enabled === true
      ? true
      : transferStatus === "active";
  const payoutsEnabled =
    account && account.payouts_enabled === true
      ? true
      : transferStatus === "active";
  const detailsSubmitted =
    account && account.details_submitted === true
      ? true
      : Boolean(
          account &&
            account.requirements &&
            account.requirements.summary &&
            account.requirements.summary.minimum_deadline == null
        );
  return {
    charges_enabled: Boolean(chargesEnabled),
    payouts_enabled: Boolean(payoutsEnabled),
    details_submitted: Boolean(detailsSubmitted),
    transfer_capability_status: transferStatus
  };
}

async function createRecipientAccountV2(stripe, opts = {}) {
  if (!stripe || !stripe.v2 || !stripe.v2.core || !stripe.v2.core.accounts) {
    throw new Error("Stripe Accounts v2 client unavailable");
  }
  return stripe.v2.core.accounts.create(buildRecipientAccountV2CreateBody(opts));
}

async function createRecipientAccountOnboardingLink(
  stripe,
  {
    accountId,
    returnUrl,
    refreshUrl
  } = {}
) {
  if (!accountId) {
    throw new Error("accountId required for Account Link");
  }
  if (
    stripe &&
    stripe.v2 &&
    stripe.v2.core &&
    stripe.v2.core.accountLinks &&
    typeof stripe.v2.core.accountLinks.create === "function"
  ) {
    return stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          return_url: returnUrl,
          refresh_url: refreshUrl
        }
      }
    });
  }
  // Legacy fallback only when Accounts v1 Account Links remain available.
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding"
  });
}

function buildMarketplaceDestinationCheckoutParams({
  split,
  connectedAccountId,
  listingTitle,
  currency = "eur",
  successUrl,
  cancelUrl,
  metadata = {},
  customerEmail
}) {
  if (!split || !connectedAccountId) {
    throw new Error("Marketplace destination checkout requires split + connectedAccountId");
  }
  return {
    mode: "payment",
    customer_email: customerEmail || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: String(currency).toLowerCase(),
          unit_amount: split.buyer_pays_cents,
          product_data: {
            name: listingTitle || "HAVKAR marketplace purchase",
            description: "Includes HAVKAR buyer fee (2%). Seller receives list − 3%."
          }
        }
      }
    ],
    payment_intent_data: {
      application_fee_amount: split.application_fee_cents,
      transfer_data: {
        destination: connectedAccountId
      },
      metadata: {
        ...metadata,
        havkar_flow: "marketplace",
        platform_commission_eur: String(split.platform_commission_eur)
      }
    },
    metadata: {
      ...metadata,
      havkar_flow: "marketplace",
      connected_account_id: connectedAccountId
    },
    success_url: successUrl,
    cancel_url: cancelUrl
  };
}

module.exports = {
  marketplaceCardSplit,
  buildRecipientAccountV2CreateBody,
  buildMarketplaceDestinationCheckoutParams,
  createRecipientAccountV2,
  createRecipientAccountOnboardingLink,
  connectAccountFlagsFromV2,
  recipientCapabilityStatus,
  eurosToCents
};
