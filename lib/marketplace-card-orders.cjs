/*
 * Build / normalize marketplace_card_orders rows from Stripe Checkout sessions.
 * Additive registry for ads-based Buy & Sell (not legacy marketplace_orders).
 */

const { marketplaceCardSplit } = require("./marketplace-connect.cjs");

function roundCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function minorToMajor(minor) {
  if (minor == null || minor === "") return null;
  const n = Number(minor);
  if (!Number.isFinite(n)) return null;
  return roundCents(n / 100);
}

function firstString(...values) {
  for (const value of values) {
    const s = String(value == null ? "" : value).trim();
    if (s) return s;
  }
  return null;
}

function buildMarketplaceCardOrderFromSession(session, extras = {}) {
  const meta = (session && session.metadata) || {};
  const listingId = Number(meta.listing_id || extras.listingId);
  if (!Number.isSafeInteger(listingId) || listingId <= 0) {
    return { ok: false, reason: "missing_listing_id" };
  }

  const buyerId = firstString(
    meta.havkar_user_id,
    extras.buyerUserId
  );
  const sellerId = firstString(meta.seller_id, extras.sellerUserId);
  if (!buyerId || !sellerId) {
    return { ok: false, reason: "missing_buyer_or_seller" };
  }

  const listPrice =
    roundCents(meta.list_price_eur) != null
      ? roundCents(meta.list_price_eur)
      : null;
  const split = listPrice != null ? marketplaceCardSplit(listPrice) : null;

  const buyerPays =
    minorToMajor(session && session.amount_total) != null
      ? minorToMajor(session.amount_total)
      : split
        ? split.buyer_pays_eur
        : null;
  if (buyerPays == null) {
    return { ok: false, reason: "missing_buyer_pays" };
  }

  const platformFee =
    roundCents(meta.platform_commission_eur) != null
      ? roundCents(meta.platform_commission_eur)
      : split
        ? split.platform_commission_eur
        : null;
  const sellerReceives =
    platformFee != null
      ? roundCents(buyerPays - platformFee)
      : split
        ? split.seller_receives_eur
        : null;

  const paymentIntent = session && session.payment_intent;
  const paymentIntentId =
    typeof paymentIntent === "string"
      ? paymentIntent
      : paymentIntent && paymentIntent.id
        ? String(paymentIntent.id)
        : firstString(extras.paymentIntentId);

  let chargeId = firstString(extras.chargeId);
  let transferId = firstString(extras.transferId);
  let applicationFeeId = firstString(extras.applicationFeeId);
  if (paymentIntent && typeof paymentIntent === "object") {
    const latest = paymentIntent.latest_charge;
    if (typeof latest === "string") {
      chargeId = chargeId || latest;
    } else if (latest && latest.id) {
      chargeId = chargeId || String(latest.id);
      if (latest.transfer) {
        transferId =
          transferId ||
          (typeof latest.transfer === "string"
            ? latest.transfer
            : latest.transfer.id
              ? String(latest.transfer.id)
              : null);
      }
      if (latest.application_fee) {
        applicationFeeId =
          applicationFeeId ||
          (typeof latest.application_fee === "string"
            ? latest.application_fee
            : latest.application_fee.id
              ? String(latest.application_fee.id)
              : null);
      }
    }
  }

  return {
    ok: true,
    row: {
      ad_id: listingId,
      buyer_id: buyerId,
      seller_id: sellerId,
      listing_title: firstString(extras.listingTitle, meta.listing_title),
      list_price_eur: listPrice,
      buyer_pays: buyerPays,
      seller_receives: sellerReceives,
      platform_fee: platformFee,
      currency: String(
        (session && session.currency) || meta.havkar_currency || "eur"
      )
        .trim()
        .toLowerCase()
        .slice(0, 8),
      status: "paid",
      stripe_session_id: firstString(session && session.id, extras.sessionId),
      stripe_payment_intent: paymentIntentId,
      stripe_charge_id: chargeId,
      stripe_transfer_id: transferId,
      stripe_application_fee_id: applicationFeeId,
      stripe_connected_account_id: firstString(
        meta.connected_account_id,
        extras.connectedAccountId
      ),
      paid_at: extras.paidAt || new Date().toISOString(),
      updated_at: extras.paidAt || new Date().toISOString()
    }
  };
}

module.exports = {
  buildMarketplaceCardOrderFromSession,
  minorToMajor,
  roundCents
};
