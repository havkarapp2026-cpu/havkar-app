/*
 * Owner-only EUR 1.00 Live Checkout preparation.
 * Does NOT enable public card collection (HAVKAR_REAL_PAYMENTS_ENABLED stays off).
 * Charges only when the Owner completes Stripe Checkout in the browser.
 */

const OWNER_USER_ID = "9b34b0bb-271a-49ee-aeb7-a9d28be06a06";
const OWNER_EMAIL = "havkarapp2026@gmail.com";
const CONFIRM_PHRASE = "PREPARE_EUR_1_00_LIVE_CHECKOUT";
const AMOUNT_CENTS = 100;

function isOwnerEur1Request(req) {
  const action = String((req && req.body && req.body.action) || "");
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "ownerEur1") ||
      url.indexOf("owner-eur1-checkout") !== -1 ||
      action === "owner_eur1_prepare" ||
      action === "owner_eur1_status"
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

async function retrieveOwnerEur1Session(stripe, sessionId) {
  const id = String(sessionId || "").trim();
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) {
    return { ok: false, httpStatus: 400, error: "Invalid Checkout Session id." };
  }
  const session = await stripe.checkout.sessions.retrieve(id);
  const meta = (session && session.metadata) || {};
  if (String(meta.havkar_owner_micro_test || "") !== "true") {
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
  CONFIRM_PHRASE,
  AMOUNT_CENTS,
  isOwnerEur1Request,
  isOwnerIdentity,
  createOwnerEur1CheckoutSession,
  retrieveOwnerEur1Session
};
