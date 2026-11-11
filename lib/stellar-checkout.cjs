/*
 * Shared Stellar quote and Horizon settlement checks.
 * Testnet remains available without the Mainnet arming flag.
 * Mainnet requires HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true and a
 * configured Mainnet destination public key. Missing destinations are
 * never invented. Trade is refused. Recurring XLM is refused.
 * An order is paid only after a matching successful Horizon transaction.
 */

const {
  HORIZON_MAINNET,
  NETWORK_MAINNET,
  readMainnetDestination,
  stellarMainnetPaymentsEnabled,
  stellarMainnetLiveCollectionEnabled,
  assertMainnetDestinationFunded
} = require("./stellar-mainnet.cjs");
const {
  evaluateCryptoGeoAccess
} = require("./crypto-geo-policy.cjs");
const {
  MODEL_DIRECT_SPLIT,
  MODEL_PLATFORM_COLLECT,
  splitAmountsXlm,
  preferDirectSplit,
  allowPlatformCollectFallback,
  describeSettlementModels
} = require("./stellar-settlement-models.cjs");

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const NETWORK_TESTNET = "testnet";
const NETWORK_FEE_XLM = "0.00001";
const QUOTE_TTL_MS = 10 * 60 * 1000;
const DESTINATION_ENV = "HAVKAR_STELLAR_TESTNET_DESTINATION";
const RATE_MAX_AGE_SECONDS = 300;
const ALLOWED_XLM_FLOWS = Object.freeze([
  "marketplace",
  "services",
  "events"
]);

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
    sellerReceives: round(amount * 0.97),
    providerCommissionBps: null,
    providerCommission: null
  };
}

function quoteServiceFees(price) {
  const amount = Number(price);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const round = (value) => Math.round(value * 100) / 100;
  const commission = round(amount * 0.1);

  return {
    price: round(amount),
    listingPublicationFee: 0,
    buyerFee: 0,
    sellerFee: 0,
    buyerPays: round(amount),
    sellerReceives: round(amount - commission),
    providerCommissionBps: 1000,
    providerCommission: commission
  };
}

function quoteFeesForFlow(flow, price) {
  if (String(flow || "") === "services") {
    return quoteServiceFees(price);
  }

  return quoteListingFees(price);
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

function normalizeNetwork(value) {
  const network = String(value || "testnet").toLowerCase();

  if (network === "public" || network === "mainnet") {
    return NETWORK_MAINNET;
  }

  return NETWORK_TESTNET;
}

function readTestnetDestination(env) {
  const source = env || process.env;
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

  return {
    ok: true,
    destination: value,
    network: NETWORK_TESTNET,
    horizon: HORIZON_TESTNET
  };
}

function readNetworkDestination(network, env) {
  if (network === NETWORK_MAINNET) {
    return readMainnetDestination(env);
  }

  return readTestnetDestination(env);
}

function horizonForNetwork(network) {
  return network === NETWORK_MAINNET ? HORIZON_MAINNET : HORIZON_TESTNET;
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

function evaluateStellarCheckout(body, now = new Date(), env = process.env) {
  const input = body && typeof body === "object" ? body : {};
  const flow = String(input.flow || input.purpose || "").trim().toLowerCase();
  const network = normalizeNetwork(input.network);
  const geoInput =
    input._geo && typeof input._geo === "object"
      ? input._geo
      : {
          country: input.country_code || input.country || null,
          uncertain: true
        };
  const geo = evaluateCryptoGeoAccess(geoInput, env);

  if (!geo.allowed) {
    return refused(
      geo.status || 403,
      geo.code || "CRYPTO_GEO_RESTRICTED",
      geo.error || "Crypto checkout is geo-restricted."
    );
  }

  if (network === NETWORK_MAINNET && !stellarMainnetPaymentsEnabled(env)) {
    return refused(
      403,
      "STELLAR_MAINNET_DISABLED",
      "Stellar Mainnet payments are disabled until HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true."
    );
  }

  if (
    network === NETWORK_MAINNET &&
    !stellarMainnetLiveCollectionEnabled(env)
  ) {
    return refused(
      403,
      "STELLAR_MAINNET_LIVE_COLLECTION_OFF",
      "Stellar Mainnet customer collection stays off until HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION=true after Owner final approval. Testnet remains available."
    );
  }

  if (flow === "trade") {
    return refused(403, "TRADE_UNCHANGED", "The Trade exchange is not an XLM checkout.");
  }

  if (
    flow === "subscription" ||
    flow === "recurring" ||
    flow === "ai" ||
    flow === "jobs"
  ) {
    return refused(
      403,
      "XLM_RECURRING_UNSUPPORTED",
      "A one-time XLM payment cannot start a recurring subscription or digital entitlement. Use Google Play Billing / Apple IAP for digital subscriptions, or a supported one-time physical-goods/services/events flow."
    );
  }

  if (ALLOWED_XLM_FLOWS.indexOf(flow) === -1) {
    return refused(
      400,
      "XLM_FLOW_UNSUPPORTED",
      "XLM checkout supports only marketplace, services, and events one-time flows."
    );
  }

  const fees = quoteFeesForFlow(flow, input.price);

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
    network: network,
    horizon: horizonForNetwork(network),
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
    const age = nowMs / 1000 - updated;

    if (age > RATE_MAX_AGE_SECONDS) {
      return null;
    }
  }

  return price;
}

async function buildXlmQuote(decision, options) {
  const settings = options || {};
  const env = settings.env || process.env;
  const platform = readNetworkDestination(decision.network, env);

  if (!platform.ok) {
    return platform;
  }

  const fetchImpl = settings.fetchImpl || fetch;

  if (decision.network === NETWORK_MAINNET) {
    const live = await assertMainnetDestinationFunded(platform.destination, {
      fetchImpl,
      horizon: platform.horizon || HORIZON_MAINNET
    });

    if (!live.ok) {
      return {
        ...live,
        payable: false,
        paid: false,
        order_paid: false
      };
    }
  }

  const eurPerXlm = await fetchEurPerXlm(fetchImpl, settings.nowMs || Date.now());

  if (!eurPerXlm) {
    return refused(
      503,
      "XLM_RATE_UNAVAILABLE",
      "A current EUR per XLM rate was not available. No amount was invented and nothing was marked paid."
    );
  }

  const memo = shortMemo(settings.memoBytes || require("crypto").randomBytes(10));
  const merchantKey = String(settings.merchantDestination || "").trim();
  const canDirect =
    preferDirectSplit(env) &&
    isPublicKey(merchantKey) &&
    merchantKey !== platform.destination;

  if (canDirect) {
    const split = splitAmountsXlm(decision.fees, eurPerXlm, xlmFromEur);

    if (!split) {
      return refused(
        400,
        "XLM_AMOUNT_INVALID",
        "Direct-split XLM amounts could not be calculated from the fee schedule."
      );
    }

    if (decision.network === NETWORK_MAINNET) {
      const merchantLive = await assertMainnetDestinationFunded(merchantKey, {
        fetchImpl,
        horizon: platform.horizon || HORIZON_MAINNET
      });

      if (!merchantLive.ok) {
        return {
          ...merchantLive,
          payable: false,
          paid: false,
          order_paid: false,
          code: "MERCHANT_DESTINATION_UNFUNDED",
          error:
            "The merchant Stellar receive account is not funded on Mainnet. The seller must create/fund their account before direct XLM settlement."
        };
      }
    }

    return {
      ...decision,
      ok: true,
      payable: true,
      paid: false,
      order_paid: false,
      settlement_model: MODEL_DIRECT_SPLIT,
      destination: merchantKey,
      merchant_destination: merchantKey,
      platform_destination: platform.destination,
      merchant_amount_xlm: split.merchant_amount_xlm,
      platform_fee_xlm: split.platform_fee_xlm,
      amount_xlm: split.amount_xlm,
      memo: memo,
      memo_type: "text",
      eur_per_xlm: eurPerXlm,
      network_fee_xlm: NETWORK_FEE_XLM,
      horizon: platform.horizon || horizonForNetwork(decision.network),
      payments: [
        {
          role: "merchant",
          destination: merchantKey,
          amount_xlm: split.merchant_amount_xlm
        },
        {
          role: "platform_fee",
          destination: platform.destination,
          amount_xlm: split.platform_fee_xlm
        }
      ]
    };
  }

  // Failed / unavailable direct_split must never silently fall back.
  if (!allowPlatformCollectFallback(env)) {
    if (!isPublicKey(merchantKey) || merchantKey === platform.destination) {
      return refused(
        409,
        "MERCHANT_RECEIVE_KEY_REQUIRED",
        "Direct-split XLM settlement requires the seller/provider to register a Stellar receive public key. Platform-collect is disabled for customer-facing flows."
      );
    }

    return refused(
      403,
      "PLATFORM_COLLECT_DISABLED",
      "Platform-collect Stellar settlement is disabled. Customer XLM quotes require direct_split only."
    );
  }

  // Preserved legacy path — reachable only with exact
  // HAVKAR_XLM_ALLOW_PLATFORM_COLLECT=true after Owner + legal review.
  const amountXlm = xlmFromEur(decision.fees.buyerPays, eurPerXlm);

  if (!amountXlm || amountXlm === "0.0000000") {
    return refused(400, "XLM_AMOUNT_INVALID", "The XLM amount could not be calculated.");
  }

  return {
    ...decision,
    ok: true,
    payable: true,
    paid: false,
    order_paid: false,
    settlement_model: MODEL_PLATFORM_COLLECT,
    destination: platform.destination,
    merchant_destination: null,
    platform_destination: platform.destination,
    merchant_amount_xlm: null,
    platform_fee_xlm: null,
    memo: memo,
    memo_type: "text",
    amount_xlm: amountXlm,
    eur_per_xlm: eurPerXlm,
    network_fee_xlm: NETWORK_FEE_XLM,
    horizon: platform.horizon || horizonForNetwork(decision.network),
    payments: [
      {
        role: "platform_collect",
        destination: platform.destination,
        amount_xlm: amountXlm
      }
    ]
  };
}

async function saveUnpaidIntent(admin, userId, decision) {
  const row = {
    user_id: userId,
    flow: decision.flow,
    idempotency_key: decision.idempotency_key,
    amount: decision.fees.buyerPays,
    currency: "EUR",
    network: decision.network,
    status: "unpaid",
    expires_at: decision.expires_at,
    amount_xlm: decision.amount_xlm,
    eur_per_xlm: decision.eur_per_xlm,
    destination: decision.destination,
    memo: decision.memo,
    subject_id: decision.subject_id,
    settlement_model: decision.settlement_model || MODEL_DIRECT_SPLIT,
    merchant_destination: decision.merchant_destination || null,
    platform_destination: decision.platform_destination || decision.destination,
    merchant_amount_xlm: decision.merchant_amount_xlm || null,
    platform_fee_xlm: decision.platform_fee_xlm || null
  };

  let saved = await admin
    .from("marketplace_payment_intents")
    .upsert(row, { onConflict: "user_id,idempotency_key" })
    .select("id,status")
    .single();

  // Backward-compatible save if Production migration for split columns is pending.
  if (saved.error && /settlement_model|merchant_destination|platform_fee/i.test(String(saved.error.message || ""))) {
    const legacy = { ...row };
    delete legacy.settlement_model;
    delete legacy.merchant_destination;
    delete legacy.platform_destination;
    delete legacy.merchant_amount_xlm;
    delete legacy.platform_fee_xlm;
    saved = await admin
      .from("marketplace_payment_intents")
      .upsert(legacy, { onConflict: "user_id,idempotency_key" })
      .select("id,status")
      .single();
  }

  if (saved.error || !saved.data || saved.data.status !== "unpaid") {
    return { ok: false, error: "The unpaid quote could not be stored." };
  }

  return { ok: true, id: saved.data.id };
}

function samePayment(operation, destination, amountXlm) {
  return (
    operation &&
    operation.type === "payment" &&
    operation.asset_type === "native" &&
    operation.to === destination &&
    toStroops(operation.amount) === toStroops(amountXlm) &&
    operation.from !== destination
  );
}

async function loadPayments(fetchImpl, horizon, txHash) {
  const response = await fetchImpl(
    horizon + "/transactions/" + txHash + "/payments?limit=20"
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
  const env = settings.env || process.env;
  const geoInput =
    settings.geo ||
    (input._geo && typeof input._geo === "object"
      ? input._geo
      : { country: null, uncertain: true });
  const geo = evaluateCryptoGeoAccess(geoInput, env);

  if (!geo.allowed) {
    return refused(
      geo.status || 403,
      geo.code || "CRYPTO_GEO_RESTRICTED",
      geo.error || "Crypto checkout is geo-restricted."
    );
  }

  const txHash = String(input.tx_hash || input.refund_tx_hash || "")
    .trim()
    .toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(txHash)) {
    return refused(400, "TX_HASH_INVALID", "A Stellar transaction hash is required.");
  }

  let loaded = await admin
    .from("marketplace_payment_intents")
    .select(
      "id,user_id,status,expires_at,destination,memo,amount_xlm,tx_hash,payer_account,refund_tx_hash,network,settlement_model,merchant_destination,platform_destination,merchant_amount_xlm,platform_fee_xlm"
    )
    .eq("id", input.intent_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (loaded && loaded.error) {
    loaded = await admin
      .from("marketplace_payment_intents")
      .select(
        "id,user_id,status,expires_at,destination,memo,amount_xlm,tx_hash,payer_account,refund_tx_hash,network"
      )
      .eq("id", input.intent_id)
      .eq("user_id", userId)
      .maybeSingle();
  }

  const intent = loaded && loaded.data;

  if (!intent) {
    return refused(404, "INTENT_NOT_FOUND", "The unpaid quote was not found for this account.");
  }

  const network = normalizeNetwork(intent.network || input.network || NETWORK_TESTNET);
  const platform = readNetworkDestination(network, env);

  if (!platform.ok) {
    return platform;
  }

  const settlementModel =
    String(intent.settlement_model || "").toLowerCase() === MODEL_DIRECT_SPLIT
      ? MODEL_DIRECT_SPLIT
      : String(intent.settlement_model || "").toLowerCase() ===
          MODEL_PLATFORM_COLLECT
        ? MODEL_PLATFORM_COLLECT
        : // Legacy rows without settlement_model: infer from destination shape.
          intent.merchant_destination ||
            (intent.destination &&
              intent.destination !== platform.destination)
          ? MODEL_DIRECT_SPLIT
          : MODEL_PLATFORM_COLLECT;

  if (settlementModel === MODEL_PLATFORM_COLLECT) {
    if (!allowPlatformCollectFallback(env)) {
      return refused(
        403,
        "PLATFORM_COLLECT_DISABLED",
        "Platform-collect Stellar settlement is disabled. This intent cannot be settled."
      );
    }

    if (intent.destination !== platform.destination) {
      return refused(
        409,
        "DESTINATION_MISMATCH",
        "The stored quote does not match the configured Stellar destination for this network."
      );
    }
  } else {
    const merchant = String(intent.merchant_destination || intent.destination || "");
    const feeDest = String(intent.platform_destination || platform.destination);

    if (!isPublicKey(merchant) || feeDest !== platform.destination) {
      return refused(
        409,
        "DESTINATION_MISMATCH",
        "The stored direct-split quote does not match the configured platform fee destination or merchant key."
      );
    }
  }

  const horizon = horizonForNetwork(network);

  if (input.action === "refund") {
    if (settlementModel === MODEL_DIRECT_SPLIT) {
      return refused(
        409,
        "REFUND_MODEL_UNSUPPORTED",
        "Direct-split refunds must be initiated by the merchant (and separately for platform fee if applicable). Server verification for dual refunds is not enabled yet."
      );
    }

    if (intent.status !== "settled" || !intent.payer_account) {
      return refused(
        409,
        "REFUND_NOT_READY",
        "A refund can be checked only after a settled payment. No balance was changed."
      );
    }

    if (intent.refund_tx_hash === txHash) {
      return {
        ok: true,
        status: 200,
        paid: false,
        order_paid: false,
        settlement: "refunded",
        idempotent: true,
        network: network,
        error: null
      };
    }

    const refundTx = await fetchImpl(horizon + "/transactions/" + txHash);
    const refundBody = refundTx.ok ? await refundTx.json() : null;
    const refundPayments =
      refundBody && refundBody.successful === true
        ? await loadPayments(fetchImpl, horizon, txHash)
        : null;
    const refund = (refundPayments || []).find(function (operation) {
      return (
        samePayment(operation, intent.payer_account, intent.amount_xlm) &&
        operation.from === intent.destination
      );
    });
    // platform_collect refund path only (direct_split refused above)

    if (!refund) {
      return refused(
        409,
        "REFUND_NOT_VERIFIED",
        "Horizon did not show a matching native refund from the HAVKAR destination. The order stays settled."
      );
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
      return refused(
        503,
        "REFUND_NOT_RECORDED",
        "The refund was seen but the order state was not changed."
      );
    }

    return {
      ok: true,
      status: 200,
      paid: false,
      order_paid: false,
      settlement: "refunded",
      network: network,
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
      network: network,
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

    return refused(
      409,
      "QUOTE_EXPIRED",
      "The quote expired before settlement. Nothing was marked paid."
    );
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

  const txResponse = await fetchImpl(horizon + "/transactions/" + txHash);

  if (!txResponse.ok) {
    return {
      ...refused(
        409,
        "TX_NOT_FOUND",
        "Horizon has no successful record for this transaction on " +
          network +
          ". The quote stays unpaid until the ledger confirms it."
      ),
      settlement: "pending",
      network: network
    };
  }

  const tx = await txResponse.json();

  if (tx.successful !== true) {
    return {
      ...refused(
        409,
        "TX_NOT_SUCCESSFUL",
        "The transaction is not successful. Nothing was marked paid."
      ),
      settlement: "failed",
      network: network
    };
  }

  // Stellar ledger inclusion (successful=true) is final for practical settlement;
  // refuse unverified / unsuccessful records above.
  if (tx.memo_type !== "text" || tx.memo !== intent.memo) {
    return refused(409, "MEMO_MISMATCH", "The transaction memo does not match this quote.");
  }

  const payments = await loadPayments(fetchImpl, horizon, txHash);

  let payerAccount = null;

  if (settlementModel === MODEL_DIRECT_SPLIT) {
    const merchantDest = String(intent.merchant_destination || intent.destination);
    const feeDest = String(intent.platform_destination || platform.destination);
    const merchantAmt = intent.merchant_amount_xlm;
    const feeAmt = intent.platform_fee_xlm;
    const merchantPay = (payments || []).find(function (operation) {
      return samePayment(operation, merchantDest, merchantAmt);
    });
    const feePay = (payments || []).find(function (operation) {
      return samePayment(operation, feeDest, feeAmt);
    });

    if (!merchantPay || !feePay) {
      return refused(
        409,
        "PAYMENT_MISMATCH",
        "The transaction does not include matching native payments to both the merchant and the platform fee destination."
      );
    }

    if (merchantPay.from !== feePay.from) {
      return refused(
        409,
        "PAYMENT_MISMATCH",
        "Merchant and platform fee payments must come from the same payer account in one transaction."
      );
    }

    payerAccount = merchantPay.from;
  } else {
    const payment = (payments || []).find(function (operation) {
      return samePayment(operation, intent.destination, intent.amount_xlm);
    });

    if (!payment) {
      return refused(
        409,
        "PAYMENT_MISMATCH",
        "The transaction does not pay the quoted native XLM amount to the configured destination."
      );
    }

    payerAccount = payment.from;
  }

  const saved = await admin
    .from("marketplace_payment_intents")
    .update({
      status: "settled",
      tx_hash: txHash,
      payer_account: payerAccount,
      settled_at: new Date().toISOString()
    })
    .eq("id", intent.id)
    .eq("status", "unpaid")
    .select("id,status")
    .single();

  if (!saved.data || saved.data.status !== "settled") {
    return refused(
      503,
      "SETTLEMENT_NOT_RECORDED",
      "Horizon matched the payment, but the order state was not changed."
    );
  }

  return {
    ok: true,
    status: 200,
    paid: true,
    order_paid: true,
    settlement: "settled",
    settlement_model: settlementModel,
    network: network,
    payer_account: payerAccount,
    error: null
  };
}

module.exports = {
  HORIZON_TESTNET,
  HORIZON_MAINNET,
  DESTINATION_ENV,
  NETWORK_TESTNET,
  NETWORK_MAINNET,
  ALLOWED_XLM_FLOWS,
  MODEL_DIRECT_SPLIT,
  MODEL_PLATFORM_COLLECT,
  evaluateStellarCheckout,
  buildXlmQuote,
  verifyStellarSettlement,
  saveUnpaidIntent,
  quoteListingFees,
  quoteServiceFees,
  quoteFeesForFlow,
  xlmFromEur,
  toStroops,
  normalizeNetwork,
  describeSettlementModels
};
