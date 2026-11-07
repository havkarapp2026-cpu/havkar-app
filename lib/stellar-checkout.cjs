/*
 * Shared Testnet quote and Horizon settlement checks.
 * Mainnet stays disabled. A missing destination is never invented.
 * Trade is refused. Recurring XLM is refused.
 * An order is paid only after a matching successful Testnet transaction.
 */

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const NETWORK_FEE_XLM = "0.00001";
const QUOTE_TTL_MS = 10 * 60 * 1000;
const DESTINATION_ENV = "HAVKAR_STELLAR_TESTNET_DESTINATION";
const RATE_MAX_AGE_SECONDS = 300;

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

function refused(status, code, error) {
  return {
    ok: false,
    status: status,
    code: code,
    paid: false,
    order_paid: false,
    payable: false,
    error: error
  };
}

function isPublicKey(value) {
  return /^G[A-Z2-7]{55}$/.test(String(value || ""));
}

function readTestnetDestination(env) {
  const source = env || process.env;
  // Prefer the dedicated Testnet destination. Fall back to the existing
  // ticket merchant public key only when it is a valid Stellar public key.
  // Never invent a destination and never accept a secret seed.
  const primary = String(source[DESTINATION_ENV] || "").trim();
  const fallback = String(
    source.HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY || ""
  ).trim();
  const value = primary || fallback;

  if (!value) {
    return refused(
      409,
      "DESTINATION_NOT_CONFIGURED",
      "HAVKAR_STELLAR_TESTNET_DESTINATION is not set. Set it to the public key of the HAVKAR Stellar Testnet account that should receive XLM. No secret key is required or accepted here."
    );
  }

  if (!isPublicKey(value)) {
    return refused(
      409,
      "DESTINATION_INVALID",
      "HAVKAR_STELLAR_TESTNET_DESTINATION must be a Stellar public key. The configured value was rejected."
    );
  }

  return { ok: true, destination: value };
}

function toStroops(value) {
  const raw = String(value == null ? "" : value).trim();

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return null;
  }

  const parts = raw.split(".");
  const whole = parts[0];
  const fraction = parts[1] || "";

  if (fraction.length > 7) {
    return null;
  }

  return BigInt(whole) * 10000000n + BigInt((fraction + "0000000").slice(0, 7));
}

function xlmFromEur(eurAmount, eurPerXlm) {
  const eur = toStroops(Number(eurAmount).toFixed(7));
  const rate = toStroops(Number(eurPerXlm).toFixed(7));

  if (eur == null || rate == null || rate <= 0n) {
    return null;
  }

  const stroops = (eur * 10000000n + rate / 2n) / rate;
  const whole = stroops / 10000000n;
  const fraction = (stroops % 10000000n).toString().padStart(7, "0");

  return whole.toString() + "." + fraction;
}

function shortMemo(bytes) {
  return Buffer.from(bytes).toString("hex").slice(0, 20);
}

function evaluateStellarCheckout(body, now = new Date()) {
  const input = body && typeof body === "object" ? body : {};
  const flow = String(input.flow || input.purpose || "one_time");
  const network = String(input.network || "testnet").toLowerCase();

  if (network === "public" || network === "mainnet") {
    return refused(403, "STELLAR_MAINNET_DISABLED", "Stellar Mainnet payments are disabled.");
  }

  if (flow === "trade") {
    return refused(403, "TRADE_UNCHANGED", "The Trade exchange is not an XLM checkout.");
  }

  if (flow === "subscription" || flow === "recurring") {
    return refused(
      403,
      "XLM_RECURRING_UNSUPPORTED",
      "A one-time XLM payment cannot start a recurring subscription. The existing unpaid card or manual path remains unchanged."
    );
  }

  const fees = quoteListingFees(input.price);

  if (!fees) {
    return refused(400, "PRICE_REQUIRED", "A positive price is required.");
  }

  const idempotencyKey = String(input.idempotency_key || "").trim();

  if (!/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) {
    return refused(400, "IDEMPOTENCY_REQUIRED", "A client idempotency key is required.");
  }

  return {
    ok: true,
    status: 200,
    paid: false,
    order_paid: false,
    payable: false,
    settlement: "unpaid",
    network: "testnet",
    horizon: HORIZON_TESTNET,
    asset: "native",
    flow: flow,
    idempotency_key: idempotencyKey,
    subject_id: input.subject_id ? String(input.subject_id).slice(0, 80) : null,
    expires_at: new Date(now.getTime() + QUOTE_TTL_MS).toISOString(),
    fees: fees,
    network_fee_xlm: NETWORK_FEE_XLM,
    destination: null,
    error: null
  };
}

async function fetchEurPerXlm(fetchImpl, nowMs) {
  const response = await fetchImpl(
    "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=eur&include_last_updated_at=true",
    { method: "GET", headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    return null;
  }

  const body = await response.json();
  const price = Number(body && body.stellar && body.stellar.eur);
  const updated = Number(body && body.stellar && body.stellar.last_updated_at);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  if (Number.isFinite(updated)) {
    const age = (nowMs / 1000) - updated;

    if (age > RATE_MAX_AGE_SECONDS) {
      return null;
    }
  }

  return price;
}

async function buildXlmQuote(decision, options) {
  const settings = options || {};
  const destination = readTestnetDestination(settings.env);

  if (!destination.ok) {
    return destination;
  }

  const fetchImpl = settings.fetchImpl || fetch;
  const eurPerXlm = await fetchEurPerXlm(fetchImpl, settings.nowMs || Date.now());

  if (!eurPerXlm) {
    return refused(
      503,
      "XLM_RATE_UNAVAILABLE",
      "A current EUR per XLM rate was not available. No amount was invented and nothing was marked paid."
    );
  }

  const amountXlm = xlmFromEur(decision.fees.buyerPays, eurPerXlm);

  if (!amountXlm || amountXlm === "0.0000000") {
    return refused(400, "XLM_AMOUNT_INVALID", "The XLM amount could not be calculated.");
  }

  const memo = shortMemo(settings.memoBytes || require("crypto").randomBytes(10));

  return {
    ...decision,
    ok: true,
    payable: true,
    paid: false,
    order_paid: false,
    destination: destination.destination,
    memo: memo,
    memo_type: "text",
    amount_xlm: amountXlm,
    eur_per_xlm: eurPerXlm,
    network_fee_xlm: NETWORK_FEE_XLM
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
      expires_at: decision.expires_at,
      amount_xlm: decision.amount_xlm,
      eur_per_xlm: decision.eur_per_xlm,
      destination: decision.destination,
      memo: decision.memo,
      subject_id: decision.subject_id
    }, { onConflict: "user_id,idempotency_key" })
    .select("id,status")
    .single();

  if (error || !data || data.status !== "unpaid") {
    return { ok: false, error: "The unpaid quote could not be stored." };
  }

  return { ok: true, id: data.id };
}

function samePayment(operation, destination, amountXlm) {
  return operation
    && operation.type === "payment"
    && operation.asset_type === "native"
    && operation.to === destination
    && toStroops(operation.amount) === toStroops(amountXlm)
    && operation.from !== destination;
}

async function loadPayments(fetchImpl, txHash) {
  const response = await fetchImpl(
    HORIZON_TESTNET + "/transactions/" + txHash + "/payments?limit=20"
  );

  if (!response.ok) {
    return null;
  }

  const body = await response.json();
  return body && body._embedded && Array.isArray(body._embedded.records)
    ? body._embedded.records
    : [];
}

async function verifyStellarSettlement(admin, userId, body, options) {
  const input = body && typeof body === "object" ? body : {};
  const settings = options || {};
  const fetchImpl = settings.fetchImpl || fetch;
  const txHash = String(input.tx_hash || input.refund_tx_hash || "").trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(txHash)) {
    return refused(400, "TX_HASH_INVALID", "A Testnet transaction hash is required.");
  }

  const destination = readTestnetDestination(settings.env);

  if (!destination.ok) {
    return destination;
  }

  const loaded = await admin
    .from("marketplace_payment_intents")
    .select("id,user_id,status,expires_at,destination,memo,amount_xlm,tx_hash,payer_account,refund_tx_hash")
    .eq("id", input.intent_id)
    .eq("user_id", userId)
    .maybeSingle();

  const intent = loaded && loaded.data;

  if (!intent) {
    return refused(404, "INTENT_NOT_FOUND", "The unpaid quote was not found for this account.");
  }

  if (intent.destination !== destination.destination) {
    return refused(409, "DESTINATION_MISMATCH", "The stored quote does not match the configured Testnet destination.");
  }

  if (input.action === "refund") {
    if (intent.status !== "settled" || !intent.payer_account) {
      return refused(409, "REFUND_NOT_READY", "A refund can be checked only after a settled payment. No balance was changed.");
    }

    if (intent.refund_tx_hash === txHash) {
      return {
        ok: true,
        status: 200,
        paid: false,
        order_paid: false,
        settlement: "refunded",
        idempotent: true,
        error: null
      };
    }

    const refundTx = await fetchImpl(HORIZON_TESTNET + "/transactions/" + txHash);
    const refundBody = refundTx.ok ? await refundTx.json() : null;
    const refundPayments = refundBody && refundBody.successful === true
      ? await loadPayments(fetchImpl, txHash)
      : null;
    const refund = (refundPayments || []).find(function (operation) {
      return samePayment(operation, intent.payer_account, intent.amount_xlm)
        && operation.from === intent.destination;
    });

    if (!refund) {
      return refused(409, "REFUND_NOT_VERIFIED", "Horizon did not show a matching native refund from the HAVKAR destination. The order stays settled.");
    }

    const savedRefund = await admin
      .from("marketplace_payment_intents")
      .update({
        status: "refunded",
        refund_tx_hash: txHash,
        refunded_at: new Date().toISOString()
      })
      .eq("id", intent.id)
      .eq("status", "settled")
      .select("id,status")
      .single();

    if (!savedRefund.data || savedRefund.data.status !== "refunded") {
      return refused(503, "REFUND_NOT_RECORDED", "The refund was seen but the order state was not changed.");
    }

    return {
      ok: true,
      status: 200,
      paid: false,
      order_paid: false,
      settlement: "refunded",
      error: null
    };
  }

  if (intent.status === "settled" && intent.tx_hash === txHash) {
    return {
      ok: true,
      status: 200,
      paid: true,
      order_paid: true,
      settlement: "settled",
      idempotent: true,
      error: null
    };
  }

  if (intent.status === "settled") {
    return refused(409, "TX_REPLAY", "This quote is already settled with a different transaction.");
  }

  if (Date.parse(intent.expires_at) <= Date.now()) {
    await admin
      .from("marketplace_payment_intents")
      .update({ status: "expired" })
      .eq("id", intent.id)
      .eq("status", "unpaid");

    return refused(409, "QUOTE_EXPIRED", "The quote expired before settlement. Nothing was marked paid.");
  }

  const seen = await admin
    .from("marketplace_payment_intents")
    .select("id")
    .eq("tx_hash", txHash)
    .neq("id", intent.id)
    .maybeSingle();

  if (seen && seen.data) {
    return refused(409, "TX_REPLAY", "This transaction is already recorded for another quote.");
  }

  const txResponse = await fetchImpl(HORIZON_TESTNET + "/transactions/" + txHash);

  if (!txResponse.ok) {
    return refused(409, "TX_NOT_FOUND", "Horizon Testnet has no successful record for this transaction.");
  }

  const tx = await txResponse.json();

  if (tx.successful !== true) {
    return refused(409, "TX_NOT_SUCCESSFUL", "The transaction is not successful. Nothing was marked paid.");
  }

  if (tx.memo_type !== "text" || tx.memo !== intent.memo) {
    return refused(409, "MEMO_MISMATCH", "The transaction memo does not match this quote.");
  }

  const payments = await loadPayments(fetchImpl, txHash);
  const payment = (payments || []).find(function (operation) {
    return samePayment(operation, intent.destination, intent.amount_xlm);
  });

  if (!payment) {
    return refused(409, "PAYMENT_MISMATCH", "The transaction does not pay the quoted native XLM amount to the configured destination.");
  }

  const saved = await admin
    .from("marketplace_payment_intents")
    .update({
      status: "settled",
      tx_hash: txHash,
      payer_account: payment.from,
      settled_at: new Date().toISOString()
    })
    .eq("id", intent.id)
    .eq("status", "unpaid")
    .select("id,status")
    .single();

  if (!saved.data || saved.data.status !== "settled") {
    return refused(503, "SETTLEMENT_NOT_RECORDED", "Horizon matched the payment, but the order state was not changed.");
  }

  return {
    ok: true,
    status: 200,
    paid: true,
    order_paid: true,
    settlement: "settled",
    error: null
  };
}

module.exports = {
  HORIZON_TESTNET,
  DESTINATION_ENV,
  evaluateStellarCheckout,
  buildXlmQuote,
  verifyStellarSettlement,
  saveUnpaidIntent,
  xlmFromEur,
  toStroops
};
