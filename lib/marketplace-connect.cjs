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
  displayName = "HAVKAR seller"
} = {}) {
  return {
    display_name: displayName,
    contact_email: email || undefined,
    dashboard: "express",
    identity: {
      country
    },
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
    }
  };
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
  eurosToCents
};
