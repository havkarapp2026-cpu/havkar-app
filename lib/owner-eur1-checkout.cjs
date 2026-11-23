/*
 * Owner-only EUR 1.00 Live Checkout preparation.
 * Does NOT enable public card collection (HAVKAR_REAL_PAYMENTS_ENABLED stays off).
 * Charges only when the Owner completes Stripe Checkout in the browser.
 *
 * Marketplace mode: destination charge list €1.00 → buyer €1.02 / seller €0.97 /
 * platform fee €0.05 to Connect account. Payment still completes only in Stripe Checkout.
 */

const {
  marketplaceCardSplit,
  buildMarketplaceDestinationCheckoutParams
} = require("./marketplace-connect.cjs");

const OWNER_USER_ID = "9b34b0bb-271a-49ee-aeb7-a9d28be06a06";
const OWNER_EMAIL = "havkarapp2026@gmail.com";
/** Independent buyer account for Owner-approved marketplace EUR1 probe (not the seller). */
const MARKETPLACE_BUYER_USER_ID = "d3869a63-a54e-48b5-baa1-4f253415298b";
const MARKETPLACE_BUYER_EMAIL = "amirjalilnia@gmail.com";
const CONFIRM_PHRASE = "PREPARE_EUR_1_00_LIVE_CHECKOUT";
const AMOUNT_CENTS = 100;
const MARKETPLACE_LIST_EUR = 1;

function isOwnerEur1Request(req) {
  const action = String((req && req.body && req.body.action) || "");
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "ownerEur1") ||
      url.indexOf("owner-eur1-checkout") !== -1 ||
      action === "owner_eur1_prepare" ||
      action === "owner_eur1_status" ||
      action === "owner_marketplace_eur1_prepare"
  );
}

function isOwnerIdentity(user) {
  if (!user || typeof user !== "object") return false;
  const id = String(user.id || "").trim().toLowerCase();
  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  return id === OWNER_USER_ID || email === OWNER_EMAIL;
}

async function createOwnerEur1CheckoutSession(stripe, origin) {
  const successUrl =
    String(origin || "https://havkar.online").replace(/\/$/, "") +
    "/owner-eur1-checkout.html?status=success&session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl =
    String(origin || "https://havkar.online").replace(/\/$/, "") +
    "/owner-eur1-checkout.html?status=cancelled";

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: AMOUNT_CENTS,
            product_data: {
              name: "HAVKAR Owner EUR 1.00 live card test",
              description:
                "Controlled Owner-only micro charge. Public ticket collection stays paused."
            }
          }
        }
      ],
      metadata: {
        havkar_owner_micro_test: "true",
        amount_eur: "1.00",
        purpose: "owner_live_card_path_verification"
      },
      payment_intent_data: {
        metadata: {
          havkar_owner_micro_test: "true",
          amount_eur: "1.00"
        }
      },
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60
    },
    {
      idempotencyKey:
        "havkar-owner-eur1-" +
        new Date().toISOString().slice(0, 13) +
        "-" +
        String(AMOUNT_CENTS)
    }
  );

  return session;
}

async function createOwnerMarketplaceEur1CheckoutSession(
  stripe,
  origin,
  {
    listingId,
    listingTitle,
    sellerUserId,
    connectedAccountId,
    buyerUserId = MARKETPLACE_BUYER_USER_ID,
    buyerEmail = MARKETPLACE_BUYER_EMAIL
  }
) {
  const split = marketplaceCardSplit(MARKETPLACE_LIST_EUR);
  if (!split) {
    throw new Error("Invalid marketplace EUR1 split");
  }
  if (!connectedAccountId) {
    throw new Error("Seller Connect account required");
  }
  if (String(sellerUserId) === String(buyerUserId)) {
    throw new Error("Buyer and seller must be independent accounts");
  }

  const base = String(origin || "https://havkar.online").replace(/\/$/, "");
  const successUrl =
    base +
    "/owner-eur1-checkout.html?status=success&mode=marketplace&listing_id=" +
    encodeURIComponent(String(listingId)) +
    "&session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl =
    base +
    "/owner-eur1-checkout.html?status=cancelled&mode=marketplace&listing_id=" +
    encodeURIComponent(String(listingId));

  const metadata = {
    havkar_flow: "marketplace",
    listing_id: String(listingId),
    seller_id: String(sellerUserId),
    havkar_user_id: String(buyerUserId),
    list_price_eur: "1",
    havkar_currency: "EUR",
    platform_commission_eur: String(split.platform_commission_eur),
    owner_approved_eur1: "true",
    havkar_owner_micro_test: "true",
    purpose: "owner_marketplace_eur1_connect_probe"
  };

  const sessionParams = buildMarketplaceDestinationCheckoutParams({
    split,
    connectedAccountId,
    listingTitle: listingTitle || "HAVKAR EUR1 live marketplace probe",
    currency: "eur",
    successUrl,
    cancelUrl,
    customerEmail: buyerEmail,
    metadata
  });
  sessionParams.expires_at = Math.floor(Date.now() / 1000) + 60 * 60;

  const session = await stripe.checkout.sessions.create(sessionParams, {
    idempotencyKey:
      "havkar-mkt-eur1-" +
      String(listingId) +
      "-" +
      new Date().toISOString().slice(0, 13)
  });

  return { session, split };
}

async function retrieveOwnerEur1Session(stripe, sessionId) {
  const id = String(sessionId || "").trim();
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) {
    return { ok: false, httpStatus: 400, error: "Invalid Checkout Session id." };
  }
  const session = await stripe.checkout.sessions.retrieve(id);
  const meta = (session && session.metadata) || {};
  const isOwnerMicro = String(meta.havkar_owner_micro_test || "") === "true";
  const isMarketplaceEur1 =
    String(meta.havkar_flow || "") === "marketplace" &&
    String(meta.owner_approved_eur1 || "") === "true";
  if (!isOwnerMicro && !isMarketplaceEur1) {
    return {
      ok: false,
      httpStatus: 404,
      error: "Session is not an Owner EUR 1 micro-test."
    };
  }
  return {
    ok: true,
    httpStatus: 200,
    session_id: session.id,
    payment_status: session.payment_status,
    status: session.status,
    amount_total: session.amount_total,
    currency: session.currency,
    livemode: session.livemode === true,
    listing_id: meta.listing_id || null,
    havkar_flow: meta.havkar_flow || null,
    payment_intent:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent && session.payment_intent.id
          ? session.payment_intent.id
          : null
  };
}

module.exports = {
  OWNER_USER_ID,
  OWNER_EMAIL,
  MARKETPLACE_BUYER_USER_ID,
  MARKETPLACE_BUYER_EMAIL,
  CONFIRM_PHRASE,
  AMOUNT_CENTS,
  MARKETPLACE_LIST_EUR,
  isOwnerEur1Request,
  isOwnerIdentity,
  createOwnerEur1CheckoutSession,
  createOwnerMarketplaceEur1CheckoutSession,
  retrieveOwnerEur1Session
};
