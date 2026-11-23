/**
 * Read-only Stellar metrics for internal SCF / Owner audit.
 * Never invents volume; only aggregates confirmed marketplace_payment_intents.
 */
"use strict";

async function buildStellarMetrics(db, options) {
  const opts = options || {};
  const networkFilter = String(opts.network || "")
    .trim()
    .toUpperCase();

  let query = db
    .from("marketplace_payment_intents")
    .select(
      "id,user_id,flow,amount,currency,network,status,amount_xlm,tx_hash,payer_account,settled_at,created_at,settlement_model,merchant_amount_xlm,platform_fee_xlm"
    )
    .order("created_at", { ascending: false })
    .limit(2000);

  if (networkFilter === "PUBLIC" || networkFilter === "TESTNET") {
    query = query.eq("network", networkFilter);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = data || [];
  const settled = rows.filter(
    (r) =>
      String(r.status || "").toLowerCase() === "settled" &&
      String(r.tx_hash || "").trim().length > 0
  );
  const failed = rows.filter((r) =>
    ["failed", "expired", "cancelled"].includes(
      String(r.status || "").toLowerCase()
    )
  );

  const wallets = new Set();
  const businesses = new Set();
  let volumeXlm = 0;
  let platformFeeXlm = 0;
  const byMonth = {};
  const byNetwork = { PUBLIC: 0, TESTNET: 0 };

  settled.forEach((row) => {
    if (row.payer_account) wallets.add(String(row.payer_account));
    if (row.user_id) businesses.add(String(row.user_id));
    const xlm = Number(row.amount_xlm);
    if (Number.isFinite(xlm)) volumeXlm += xlm;
    const fee = Number(row.platform_fee_xlm);
    if (Number.isFinite(fee)) platformFeeXlm += fee;
    const net = String(row.network || "").toUpperCase();
    if (byNetwork[net] != null) byNetwork[net] += 1;
    const month = String(row.settled_at || row.created_at || "").slice(0, 7);
    if (month) {
      byMonth[month] = (byMonth[month] || 0) + 1;
    }
  });

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    source: "marketplace_payment_intents",
    note:
      "Counts only HAVKAR-recorded Stellar payment intents with a non-empty tx_hash and settled status. Test activity must not be presented as production growth without network filter.",
    totals: {
      intents_scanned: rows.length,
      settled_with_tx: settled.length,
      failed_or_expired: failed.length,
      unique_payer_accounts: wallets.size,
      unique_user_ids: businesses.size,
      volume_xlm: Math.round(volumeXlm * 1e7) / 1e7,
      platform_fee_xlm: Math.round(platformFeeXlm * 1e7) / 1e7
    },
    by_network: byNetwork,
    by_month: byMonth,
    recent_settled: settled.slice(0, 20).map((r) => ({
      id: r.id,
      network: r.network,
      status: r.status,
      amount_xlm: r.amount_xlm,
      tx_hash: r.tx_hash,
      settlement_model: r.settlement_model,
      settled_at: r.settled_at,
      flow: r.flow
    })),
    money_moved_by_this_endpoint: false
  };
}

module.exports = {
  buildStellarMetrics
};
