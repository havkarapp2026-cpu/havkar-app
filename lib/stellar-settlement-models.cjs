/*
 * HAVKAR XLM settlement models (license-minimizing architecture helpers).
 *
 * Confirmed technical goal:
 * - User keeps private keys (external wallet signs).
 * - Prefer direct_split: one user-signed tx pays merchant + platform fee.
 * - platform_collect (legacy): single payment to HAVKAR destination —
 *   higher regulatory exposure; kept for events / merchants without a
 *   registered receive key / Owner-gated fallback.
 *
 * This file is not a legal determination of CASP status.
 */

const MODEL_DIRECT_SPLIT = "direct_split";
const MODEL_PLATFORM_COLLECT = "platform_collect";

function roundEur(value) {
  return Math.round(Number(value) * 100) / 100;
}

function platformFeeEurFromFees(fees) {
  if (!fees) {
    return null;
  }

  const buyerPays = Number(fees.buyerPays);
  const sellerReceives = Number(fees.sellerReceives);

  if (!Number.isFinite(buyerPays) || !Number.isFinite(sellerReceives)) {
    return null;
  }

  return roundEur(buyerPays - sellerReceives);
}

function splitAmountsXlm(fees, eurPerXlm, xlmFromEur) {
  const sellerEur = Number(fees.sellerReceives);
  const feeEur = platformFeeEurFromFees(fees);
  const buyerEur = Number(fees.buyerPays);

  if (
    !Number.isFinite(sellerEur) ||
    !Number.isFinite(feeEur) ||
    !Number.isFinite(buyerEur) ||
    sellerEur < 0 ||
    feeEur < 0 ||
    buyerEur <= 0
  ) {
    return null;
  }

  const merchantAmount = xlmFromEur(sellerEur, eurPerXlm);
  const platformFee = xlmFromEur(feeEur, eurPerXlm);
  const total = xlmFromEur(buyerEur, eurPerXlm);

  if (!merchantAmount || !platformFee || !total) {
    return null;
  }

  // Guard against rounding drift: merchant + fee must equal buyer total in stroops.
  function toStroops(value) {
    const text = String(value || "");
    const match = /^(\d+)(?:\.(\d{0,7}))?$/.exec(text);

    if (!match) {
      return null;
    }

    const whole = BigInt(match[1]);
    const frac = String(match[2] || "")
      .padEnd(7, "0")
      .slice(0, 7);
    return whole * 10000000n + BigInt(frac || "0");
  }

  const m = toStroops(merchantAmount);
  const f = toStroops(platformFee);
  const t = toStroops(total);

  if (m == null || f == null || t == null) {
    return null;
  }

  if (m + f !== t) {
    const residualStroops = t - m;

    if (residualStroops <= 0n) {
      return null;
    }

    const residual = (Number(residualStroops) / 1e7).toFixed(7);

    return {
      merchant_amount_xlm: merchantAmount,
      platform_fee_xlm: residual,
      amount_xlm: total,
      seller_receives_eur: sellerEur,
      platform_fee_eur: feeEur,
      buyer_pays_eur: buyerEur
    };
  }

  return {
    merchant_amount_xlm: merchantAmount,
    platform_fee_xlm: platformFee,
    amount_xlm: total,
    seller_receives_eur: sellerEur,
    platform_fee_eur: feeEur,
    buyer_pays_eur: buyerEur
  };
}

function preferDirectSplit(env = process.env) {
  // Default ON for new quotes when a merchant key exists.
  // Set HAVKAR_XLM_DIRECT_SPLIT=false to force legacy platform_collect.
  return env?.HAVKAR_XLM_DIRECT_SPLIT !== "false";
}

function allowPlatformCollectFallback(env = process.env) {
  // Default ON so Testnet / events / merchants without keys keep working.
  // Owner may set false after merchants register receive keys.
  return env?.HAVKAR_XLM_ALLOW_PLATFORM_COLLECT !== "false";
}

function describeSettlementModels() {
  return {
    preferred: MODEL_DIRECT_SPLIT,
    models: {
      [MODEL_DIRECT_SPLIT]:
        "User-signed Stellar tx with native payments to merchant receive key + platform fee key. HAVKAR does not take custody of the purchase amount.",
      [MODEL_PLATFORM_COLLECT]:
        "User-signed single native payment to HAVKAR network destination. Higher regulatory exposure; use only as fallback or when HAVKAR is the fulfillment merchant (e.g. some events)."
    },
    fee_economics_unchanged: {
      marketplace_buyer_bps: 200,
      marketplace_seller_bps: 300,
      services_provider_bps: 1000
    }
  };
}

module.exports = {
  MODEL_DIRECT_SPLIT,
  MODEL_PLATFORM_COLLECT,
  platformFeeEurFromFees,
  splitAmountsXlm,
  preferDirectSplit,
  allowPlatformCollectFallback,
  describeSettlementModels
};
