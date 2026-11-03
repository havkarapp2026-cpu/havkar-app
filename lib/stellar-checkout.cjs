/*
 * Shared Testnet quote checks for eligible one-time HAVKAR checkouts.
 * Mainnet stays disabled. This module never marks an order paid.
 * The Trade exchange is not a checkout and is refused here.
 */

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const NETWORK_FEE_XLM = "0.00001";
const QUOTE_TTL_MS = 10 * 60 * 1000;

function quoteListingFees(price) {
  const amount = Number(price);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const round = (value) => Math.round(value * 100) / 100;

  return {
    price: round(amount),
    listingPublicationFee: 0,
    buyerFee: round(amount * 0.02),
    sellerFee: round(amount * 0.03),
    buyerPays: round(amount * 1.02),
    sellerReceives: round(amount * 0.97)
  };
}

function evaluateStellarCheckout(body, now = new Date()) {
  const input = body && typeof body === "object" ? body : {};
  const flow = String(input.flow || input.purpose || "one_time");
  const network = String(input.network || "testnet").toLowerCase();

  if (network === "public" || network === "mainnet") {
    return {
      ok: false,
      status: 403,
      code: "STELLAR_MAINNET_DISABLED",
      paid: false,
      order_paid: false,
      error: "Stellar Mainnet payments are disabled."
    };
  }

  if (flow === "trade") {
    return {
      ok: false,
      status: 403,
      code: "TRADE_UNCHANGED",
      paid: false,
      order_paid: false,
      error: "The Trade exchange is not an XLM checkout."
    };
  }

  if (flow === "subscription" || flow === "recurring") {
    return {
      ok: false,
      status: 403,
      code: "XLM_RECURRING_UNSUPPORTED",
      paid: false,
      order_paid: false,
      error: "A one-time XLM payment cannot start a recurring subscription. Card subscriptions remain paused."
    };
  }

  if (input.action === "verify") {
    return {
      ok: false,
      status: 409,
      code: "SETTLEMENT_RECORDING_DISABLED",
      paid: false,
      order_paid: false,
      error: "HAVKAR does not mark an order paid until a verified settlement is recorded, and that recording is disabled."
    };
  }

  const fees = quoteListingFees(input.price);

  if (!fees) {
    return {
      ok: false,
      status: 400,
      paid: false,
      order_paid: false,
      error: "A positive price is required."
    };
  }

  const idempotencyKey = String(input.idempotency_key || "").trim();

  if (!/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) {
    return {
      ok: false,
      status: 400,
      paid: false,
      order_paid: false,
      error: "A client idempotency key is required."
    };
  }

  return {
    ok: true,
    status: 200,
    paid: false,
    order_paid: false,
    settlement: "unpaid",
    network: "testnet",
    horizon: HORIZON_TESTNET,
    asset: "native",
    flow: flow,
    idempotency_key: idempotencyKey,
    expires_at: new Date(now.getTime() + QUOTE_TTL_MS).toISOString(),
    fees: fees,
    network_fee_xlm: NETWORK_FEE_XLM,
    payable: false,
    destination: null,
    memo: idempotencyKey,
    memo_type: "text",
    error: null
  };
}

async function saveUnpaidIntent(admin, userId, decision) {
  const { data, error } = await admin
    .from("marketplace_payment_intents")
    .upsert({
      user_id: userId,
      flow: decision.flow,
      idempotency_key: decision.idempotency_key,
      amount: decision.fees.buyerPays,
      currency: "EUR",
      network: "testnet",
      status: "unpaid",
      expires_at: decision.expires_at
    }, { onConflict: "user_id,idempotency_key" })
    .select("id,status")
    .single();

  if (error || !data || data.status !== "unpaid") {
    return { ok: false, error: "The unpaid quote could not be stored." };
  }

  return { ok: true, id: data.id };
}

module.exports = {
  HORIZON_TESTNET,
  evaluateStellarCheckout,
  saveUnpaidIntent
};
