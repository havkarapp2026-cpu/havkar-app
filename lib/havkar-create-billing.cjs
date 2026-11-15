/**
 * HAVKAR CREATE billing structure (quotes only).
 * No live charges. Rates are draft placeholders pending Owner approval.
 */

const CREATE_BILLING_POLICY = Object.freeze({
  idea_registration: { amount_eur: 0, note: "Idea registration is free." },
  draft_rates_pending_owner_approval: true,
  live_charges_enabled: false,
  marketplace_fees_untouched: true,
  digital_product_commission_bps_draft: null,
  note:
    "CREATE usage pricing and digital-product commission remain draft until Owner approval. Existing marketplace 2%/3% fees are unchanged."
});

/** Draft unit costs in EUR cents — NOT approved for charging. */
const DRAFT_UNIT_CENTS = Object.freeze({
  ai_analysis: 50,
  ai_content_block: 25,
  hosting_day: 10,
  preview_build: 5,
  publish_review_submit: 0,
  sandbox_runtime_hour: 8
});

function quoteCreateUsage(items) {
  const lines = [];
  let total = 0;
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i] || {};
    const key = String(row.sku || "").trim();
    const qty = Math.max(0, Math.min(10000, Number(row.qty) || 0));
    const unit = DRAFT_UNIT_CENTS[key];
    if (unit == null) {
      return {
        ok: false,
        error: "Unknown CREATE billing sku: " + key,
        live_charges_enabled: false
      };
    }
    const line = unit * qty;
    total += line;
    lines.push({
      sku: key,
      qty: qty,
      unit_cents_draft: unit,
      line_cents_draft: line
    });
  }
  return {
    ok: true,
    currency: "EUR",
    lines: lines,
    total_cents_draft: total,
    live_charges_enabled: false,
    policy: CREATE_BILLING_POLICY
  };
}

module.exports = { CREATE_BILLING_POLICY, quoteCreateUsage };
