/*
 * Automatic Jobs XLM settlement (Stellar Mainnet / Testnet).
 *
 * Discovers Horizon-confirmed payments for unpaid jobs_listing intents and
 * settles + activates exactly once. No manual DB activation. Public tariffs
 * are unchanged. Never invents amounts, destinations, or memos.
 */

const {
  verifyStellarSettlement,
  normalizeNetwork,
  toStroops,
  NETWORK_MAINNET
} = require("./stellar-checkout.cjs");

const { HORIZON_MAINNET } = require("./stellar-mainnet.cjs");

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const FLOW = "jobs_listing";
const MAX_INTENTS = 40;
const PAYMENTS_PAGE = 40;

function horizonFor(network) {
  return normalizeNetwork(network) === NETWORK_MAINNET
    ? HORIZON_MAINNET
    : HORIZON_TESTNET;
}

function isHexTx(value) {
  return /^[a-f0-9]{64}$/.test(String(value || "").trim().toLowerCase());
}

/**
 * Find a Horizon tx that pays exact native amount to destination with matching
 * text memo, before quote expiry. Prefers newest matching successful payment.
 */
async function discoverMatchingTxHash(intent, options) {
  const settings = options || {};
  const fetchImpl = settings.fetchImpl || fetch;
  const destination = String(intent.destination || "").trim();
  const amountXlm = String(intent.amount_xlm || "").trim();
  const memo = String(intent.memo || "");
  const expiresAt = Date.parse(intent.expires_at);
  const createdAt = Date.parse(intent.created_at || 0);

  if (!destination || !amountXlm || !memo || !Number.isFinite(expiresAt)) {
    return { ok: false, code: "INTENT_INCOMPLETE", tx_hash: null };
  }

  const horizon = horizonFor(intent.network);
  let response;
  try {
    response = await fetchImpl(
      horizon +
        "/accounts/" +
        encodeURIComponent(destination) +
        "/payments?order=desc&limit=" +
        PAYMENTS_PAGE,
      { method: "GET", headers: { Accept: "application/json" } }
    );
  } catch (_err) {
    return { ok: false, code: "HORIZON_UNAVAILABLE", tx_hash: null };
  }

  if (!response.ok) {
    return { ok: false, code: "HORIZON_PAYMENTS_FAILED", tx_hash: null };
  }

  const body = await response.json();
  const records =
    body && body._embedded && Array.isArray(body._embedded.records)
      ? body._embedded.records
      : [];

  const amountStroops = toStroops(amountXlm);
  const candidates = [];

  for (const op of records) {
    if (!op || op.type !== "payment" || op.asset_type !== "native") continue;
    if (op.to !== destination) continue;
    if (op.from === destination) continue;
    if (toStroops(op.amount) !== amountStroops) continue;
    if (op.transaction_successful !== true) continue;
    const hash = String(op.transaction_hash || "").trim().toLowerCase();
    if (!isHexTx(hash)) continue;
    candidates.push({
      hash: hash,
      created_at: op.created_at
    });
  }

  for (const candidate of candidates) {
    let txRes;
    try {
      txRes = await fetchImpl(horizon + "/transactions/" + candidate.hash, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
    } catch (_err) {
      continue;
    }
    if (!txRes.ok) continue;
    const tx = await txRes.json();
    if (tx.successful !== true) continue;
    if (tx.memo_type !== "text" || String(tx.memo) !== memo) continue;
    const txCreated = Date.parse(tx.created_at || candidate.created_at);
    if (!Number.isFinite(txCreated)) continue;
    if (txCreated > expiresAt) continue;
    // Reject payments that clearly predate the quote (replay of older transfers).
    if (Number.isFinite(createdAt) && createdAt > 0 && txCreated + 5000 < createdAt) {
      continue;
    }
    return { ok: true, code: null, tx_hash: candidate.hash };
  }

  return { ok: false, code: "NO_MATCHING_PAYMENT", tx_hash: null };
}

async function activateJobsListing(admin, intent) {
  const jobId = String(intent.subject_id || "").trim();
  if (!jobId) {
    return {
      ok: false,
      fulfillment: null,
      error: "Jobs subject is missing on the settled quote."
    };
  }

  let nextOrdinaryExpiry = null;
  try {
    const billing = require("../havkar-job-billing.js");
    nextOrdinaryExpiry = billing.nextOrdinaryExpiry || null;
  } catch (_err) {
    nextOrdinaryExpiry = null;
  }

  const expiry = nextOrdinaryExpiry
    ? nextOrdinaryExpiry(Date.now(), null)
    : { ok: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() };

  if (!expiry || !expiry.ok) {
    return {
      ok: false,
      fulfillment: "jobs_listing_intent",
      job_id: jobId,
      error: "Could not compute Jobs listing expiry after XLM settlement."
    };
  }

  const updated = await admin
    .from("jobs")
    .update({
      status: "active",
      expires_at: expiry.expiresAt
    })
    .eq("id", jobId)
    .eq("user_id", intent.user_id)
    .eq("status", "pending_payment")
    .select("id,status,expires_at")
    .maybeSingle();

  if (!updated.data || String(updated.data.status) !== "active") {
    // Already active for this settled payment is treated as idempotent success.
    const existing = await admin
      .from("jobs")
      .select("id,status,expires_at")
      .eq("id", jobId)
      .eq("user_id", intent.user_id)
      .maybeSingle();
    if (existing.data && String(existing.data.status) === "active") {
      return {
        ok: true,
        fulfillment: "jobs_listing_already_active",
        job_id: jobId,
        expires_at: existing.data.expires_at,
        error: null
      };
    }
    return {
      ok: false,
      fulfillment: "jobs_listing_intent",
      job_id: jobId,
      error:
        "XLM settlement verified. Listing could not be activated (already active or unavailable)."
    };
  }

  return {
    ok: true,
    fulfillment: "jobs_listing_activated",
    job_id: jobId,
    expires_at: updated.data.expires_at,
    error: null
  };
}

async function settleJobsIntent(admin, intent, options) {
  const settings = options || {};
  const fetchImpl = settings.fetchImpl || fetch;
  const env = settings.env || process.env;

  if (!intent || String(intent.flow) !== FLOW) {
    return {
      ok: false,
      code: "NOT_JOBS_LISTING",
      paid: false,
      activated: false
    };
  }

  if (String(intent.status) === "settled" && intent.tx_hash) {
    const fulfillment = await activateJobsListing(admin, intent);
    return {
      ok: true,
      code: null,
      paid: true,
      order_paid: true,
      settlement: "settled",
      idempotent: true,
      intent_id: intent.id,
      tx_hash: intent.tx_hash,
      activated: fulfillment.ok === true,
      fulfillment: fulfillment.fulfillment,
      job_id: fulfillment.job_id || intent.subject_id,
      expires_at: fulfillment.expires_at || null,
      error: fulfillment.error
    };
  }

  if (String(intent.status) !== "unpaid") {
    return {
      ok: false,
      code: "INTENT_NOT_UNPAID",
      paid: false,
      activated: false,
      intent_id: intent.id
    };
  }

  if (Date.parse(intent.expires_at) <= Date.now()) {
    await admin
      .from("marketplace_payment_intents")
      .update({ status: "expired" })
      .eq("id", intent.id)
      .eq("status", "unpaid");
    return {
      ok: false,
      code: "QUOTE_EXPIRED",
      paid: false,
      activated: false,
      intent_id: intent.id
    };
  }

  let txHash = String(settings.txHash || "").trim().toLowerCase();
  if (!isHexTx(txHash)) {
    const found = await discoverMatchingTxHash(intent, {
      fetchImpl: fetchImpl
    });
    if (!found.ok || !found.tx_hash) {
      return {
        ok: false,
        code: found.code || "NO_MATCHING_PAYMENT",
        paid: false,
        activated: false,
        intent_id: intent.id
      };
    }
    txHash = found.tx_hash;
  }

  const settled = await verifyStellarSettlement(
    admin,
    intent.user_id,
    {
      intent_id: intent.id,
      tx_hash: txHash,
      action: "verify",
      payment_method: "xlm",
      network: intent.network
    },
    {
      fetchImpl: fetchImpl,
      env: env,
      skipGeo: true
    }
  );

  if (!settled || settled.ok !== true || settled.order_paid !== true) {
    return {
      ok: false,
      code: (settled && settled.code) || "SETTLEMENT_FAILED",
      paid: false,
      activated: false,
      intent_id: intent.id,
      tx_hash: txHash,
      error: settled && settled.error
    };
  }

  const fulfillment = await activateJobsListing(admin, {
    ...intent,
    status: "settled",
    tx_hash: txHash
  });

  return {
    ok: true,
    code: null,
    paid: true,
    order_paid: true,
    settlement: "settled",
    intent_id: intent.id,
    tx_hash: txHash,
    activated: fulfillment.ok === true,
    fulfillment: fulfillment.fulfillment,
    job_id: fulfillment.job_id || intent.subject_id,
    expires_at: fulfillment.expires_at || null,
    error: fulfillment.error,
    accounting: settled.accounting || null
  };
}

async function loadUnpaidJobsIntents(admin, options) {
  const settings = options || {};
  const userId = settings.userId ? String(settings.userId) : null;
  const intentId = settings.intentId ? String(settings.intentId) : null;
  const nowIso = new Date().toISOString();

  let query = admin
    .from("marketplace_payment_intents")
    .select(
      "id,user_id,flow,status,expires_at,created_at,destination,memo,amount_xlm,tx_hash,network,settlement_model,subject_id,amount,currency"
    )
    .eq("flow", FLOW)
    .eq("status", "unpaid")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(MAX_INTENTS);

  if (userId) {
    query = query.eq("user_id", userId);
  }
  if (intentId) {
    query = query.eq("id", intentId);
  }

  const loaded = await query;
  if (loaded.error) {
    return { ok: false, error: loaded.error.message || "query_failed", intents: [] };
  }
  return { ok: true, intents: loaded.data || [], error: null };
}

/**
 * Sweep unpaid Jobs XLM quotes: Horizon match → settle → activate once.
 */
async function autoSettleJobsXlmIntents(admin, options) {
  const settings = options || {};
  const loaded = await loadUnpaidJobsIntents(admin, settings);
  if (!loaded.ok) {
    return {
      ok: false,
      scanned: 0,
      settled: 0,
      activated: 0,
      results: [],
      error: loaded.error
    };
  }

  const results = [];
  let settledCount = 0;
  let activatedCount = 0;

  for (const intent of loaded.intents) {
    const outcome = await settleJobsIntent(admin, intent, settings);
    results.push(outcome);
    if (outcome.paid) settledCount += 1;
    if (outcome.activated) activatedCount += 1;
  }

  return {
    ok: true,
    scanned: loaded.intents.length,
    settled: settledCount,
    activated: activatedCount,
    results: results,
    error: null
  };
}

function authorizeAutoSettleRequest(req, env) {
  const source = env || process.env;
  const cronSecret = String(source.CRON_SECRET || "").trim();
  const auth = String(
    (req && req.headers && (req.headers.authorization || req.headers.Authorization)) ||
      ""
  );
  const vercelCron = String(
    (req &&
      req.headers &&
      (req.headers["x-vercel-cron"] || req.headers["X-Vercel-Cron"])) ||
      ""
  );

  if (vercelCron === "1") {
    return { ok: true, mode: "vercel_cron" };
  }

  if (cronSecret && auth === "Bearer " + cronSecret) {
    return { ok: true, mode: "cron_secret" };
  }

  return { ok: false, mode: null };
}

module.exports = {
  FLOW,
  discoverMatchingTxHash,
  settleJobsIntent,
  autoSettleJobsXlmIntents,
  loadUnpaidJobsIntents,
  activateJobsListing,
  authorizeAutoSettleRequest,
  horizonFor
};
