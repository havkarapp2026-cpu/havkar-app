/*
 * Owner-only Jobs micro Checkout (€1.00).
 *
 * Public ORDINARY_PLANS stay unchanged (Basic €9.99 etc.).
 * Only the primary HAVKAR Owner can prepare this path.
 * Successful payment still activates the pending_payment listing.
 */

const {
  OWNER_USER_ID,
  OWNER_EMAIL,
  isOwnerIdentity
} = require("./owner-eur1-checkout.cjs");

const CONFIRM_PHRASE = "PREPARE_JOBS_EUR_1_00_LIVE_CHECKOUT";
const AMOUNT_CENTS = 100;
const AMOUNT_EUR = 1;
const MICRO_META_FLAG = "havkar_owner_jobs_micro_test";

function isOwnerJobsMicroRequest(req) {
  const action = String((req && req.body && req.body.action) || "");
  return (
    action === "jobs_owner_micro_checkout" ||
    action === "jobs_owner_micro_xlm_quote" ||
    action === "jobs_owner_micro_status"
  );
}

function isOwnerJobsMicroMetadata(metadata) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  return String(meta[MICRO_META_FLAG] || "") === "true";
}

function ownerJobsMicroAmountOk(amountTotal, currency) {
  return (
    Number(amountTotal) === AMOUNT_CENTS &&
    String(currency || "").toLowerCase() === "eur"
  );
}

async function createOwnerJobsMicroCheckoutSession(stripe, options) {
  const settings = options || {};
  const origin = String(settings.origin || "https://havkar.online").replace(
    /\/$/,
    ""
  );
  const job = settings.job;
  const ownerUser = settings.ownerUser;
  if (!job || !ownerUser) {
    throw new Error("Owner Jobs micro checkout requires job and ownerUser.");
  }

  const planName = String(job.plan || "Basic");
  const successUrl =
    origin + "/jobs.html?job_paid=1&session_id={CHECKOUT_SESSION_ID}&micro=1";
  const cancelUrl = origin + "/jobs.html?job_paid=0&mine=1&micro=1";

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: ownerUser.email || OWNER_EMAIL,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: AMOUNT_CENTS,
            product_data: {
              name:
                "HAVKAR Jobs Owner micro-test — " +
                planName +
                " (€1.00)",
              description: String(job.title || "Job advertisement")
                .slice(0, 200)
            }
          }
        }
      ],
      metadata: {
        havkar_purpose: "job_advertisement",
        havkar_flow: "jobs",
        [MICRO_META_FLAG]: "true",
        amount_eur: "1.00",
        catalog_list_price_eur: String(job.monthly_fee || ""),
        job_id: String(job.id),
        user_id: String(job.user_id),
        plan: planName,
        paid_by_owner_user_id: String(ownerUser.id)
      },
      payment_intent_data: {
        metadata: {
          havkar_purpose: "job_advertisement",
          havkar_flow: "jobs",
          [MICRO_META_FLAG]: "true",
          amount_eur: "1.00",
          job_id: String(job.id),
          user_id: String(job.user_id),
          plan: planName,
          paid_by_owner_user_id: String(ownerUser.id)
        }
      },
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60
    },
    {
      idempotencyKey: (
        "jobs_owner_micro_" +
        String(job.id) +
        "_" +
        String(ownerUser.id) +
        "_" +
        AMOUNT_CENTS +
        "_" +
        String(settings.refreshToken || Date.now())
      ).slice(0, 255)
    }
  );

  return session;
}

module.exports = {
  OWNER_USER_ID,
  OWNER_EMAIL,
  CONFIRM_PHRASE,
  AMOUNT_CENTS,
  AMOUNT_EUR,
  MICRO_META_FLAG,
  isOwnerIdentity,
  isOwnerJobsMicroRequest,
  isOwnerJobsMicroMetadata,
  ownerJobsMicroAmountOk,
  createOwnerJobsMicroCheckoutSession
};
