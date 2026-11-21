/*
 * Post verified Stellar settlements into the HAVKAR double-entry ledger.
 * Idempotent on Horizon tx hash / operation id. Never initiates transfers.
 */

const {
  moneyCents,
  buildPlatformPaymentEntry,
  buildMarketplaceSplitEntry,
  buildRefundEntry,
  postJournalEntry
} = require("./havkar-finance-ledger.cjs");

function stroopsToXlm(stroops) {
  const n = Number(stroops || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / 1e7;
}

function networkFeeEurCents(feeChargedStroops, eurPerXlm) {
  const xlm = stroopsToXlm(feeChargedStroops);
  const rate = Number(eurPerXlm || 0);
  if (!Number.isFinite(rate) || rate <= 0 || xlm <= 0) return 0;
  return moneyCents(xlm * rate);
}

function sourceSystemForNetwork(network) {
  return String(network || "").toLowerCase() === "mainnet"
    ? "stellar_mainnet"
    : "stellar_testnet";
}

/**
 * Build a balanced journal entry from a settled marketplace_payment_intent
 * that already passed Horizon verification.
 */
function buildEntryFromStellarIntent(intent, options) {
  const opts = options || {};
  if (!intent || String(intent.status || "") !== "settled") {
    return { ok: false, error: "intent_not_settled" };
  }
  const txHash = String(intent.tx_hash || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(txHash)) {
    return { ok: false, error: "invalid_tx_hash" };
  }
  const network = String(intent.network || "testnet").toLowerCase();
  const sourceSystem = sourceSystemForNetwork(network);
  const amountEur = Number(intent.amount);
  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    return { ok: false, error: "invalid_amount_eur" };
  }
  const amountCents = moneyCents(amountEur);
  const feeCents = networkFeeEurCents(
    opts.fee_charged_stroops,
    intent.eur_per_xlm
  );
  const opId = opts.operation_id ? String(opts.operation_id) : null;
  const sourceEventId = opId ? txHash + ":" + opId : txHash;
  const occurredAt =
    intent.settled_at || opts.horizon_created_at || new Date().toISOString();
  const base = {
    entry_ref: "JE-stellar-" + txHash.slice(0, 24),
    source_system: sourceSystem,
    source_event_id: sourceEventId,
    source_object_id: String(intent.id),
    occurred_at: occurredAt,
    livemode: network === "mainnet",
    currency: String(intent.currency || "EUR").toUpperCase(),
    metadata: {
      stellar_tx_hash: txHash,
      stellar_operation_id: opId,
      amount_xlm: intent.amount_xlm,
      eur_per_xlm: intent.eur_per_xlm,
      payer_account: intent.payer_account,
      destination: intent.destination,
      flow: intent.flow,
      fee_charged_stroops: opts.fee_charged_stroops || null,
      reconciliation: "stellar_separate_from_stripe"
    }
  };

  function remapStellarCash(builtEntry) {
    if (!builtEntry || !builtEntry.ok || !builtEntry.lines) return builtEntry;
    builtEntry.lines = builtEntry.lines.map(function (l) {
      if (l.account_code === "1000") {
        return Object.assign({}, l, {
          account_code: "1050",
          description:
            (l.credit_cents > 0 ? "Stellar XLM outflow (EUR book)" : "Stellar XLM received (EUR book)")
        });
      }
      return l;
    });
    return builtEntry;
  }

  if (intent.refund_tx_hash && opts.as_refund) {
    return remapStellarCash(
      buildRefundEntry(
        Object.assign({}, base, {
          entry_ref:
            "JE-stellar-refund-" + String(intent.refund_tx_hash).slice(0, 20),
          source_event_id: String(intent.refund_tx_hash),
          amount_cents: amountCents,
          memo: "Stellar refund",
          source_system: sourceSystem,
          metadata: Object.assign({}, base.metadata, { kind: "refund" })
        })
      )
    );
  }

  const flow = String(intent.flow || "").toLowerCase();
  let built;
  if (flow === "marketplace") {
    // Platform-collect XLM: full EUR amount lands at HAVKAR destination.
    // Seller GMV is liability; only commission is HAVKAR revenue.
    // amount on intent is buyer_pays (list + 2%).
    const listEur = amountEur / 1.02;
    built = buildMarketplaceSplitEntry(
      Object.assign({}, base, {
        list_cents: moneyCents(listEur),
        memo: "Stellar marketplace settlement",
        source_system: sourceSystem
      })
    );
  } else {
    built = buildPlatformPaymentEntry(
      Object.assign({}, base, {
        amount_cents: amountCents,
        stripe_fee_cents: 0,
        revenue_account_code: flow === "tickets" ? "4200" : "4300",
        memo: "Stellar platform settlement",
        source_system: sourceSystem
      })
    );
  }

  if (!built.ok) return built;
  built = remapStellarCash(built);

  if (feeCents > 0) {
    // Network fee is paid by payer on Stellar; book as informational expense
    // offset by reducing treasury only when HAVKAR paid the fee (rare).
    // Default: record 0 impact on HAVKAR books; keep stroops in metadata only.
    built.entry.metadata.network_fee_eur_cents_informational = feeCents;
  }

  return built;
}

async function postStellarSettlementAccounting(supabase, intent, options) {
  const built = buildEntryFromStellarIntent(intent, options || {});
  if (!built.ok) return built;
  return postJournalEntry(supabase, built);
}

module.exports = {
  stroopsToXlm,
  networkFeeEurCents,
  sourceSystemForNetwork,
  buildEntryFromStellarIntent,
  postStellarSettlementAccounting
};
