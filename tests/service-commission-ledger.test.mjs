import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  classifyCommissionRow,
  summarizeCommissionLedger,
  COLLECTION_STATES
} = require("../lib/service-commission-ledger.cjs");

test("uncollected cash commissions are not Stripe balance", () => {
  const cls = classifyCommissionRow({
    collection_state: COLLECTION_STATES.UNCOLLECTED,
    settlement_channel: "manual",
    commission_cents: 1000
  });
  assert.equal(cls.counts_as_stripe_balance, false);
  assert.equal(cls.counts_as_cash_receivable, true);
  assert.equal(cls.report_label, "cash_or_uncollected_receivable");
});

test("ledger summary never mixes cash receivable into stripe_collected", () => {
  const summary = summarizeCommissionLedger([
    {
      collection_state: "uncollected",
      settlement_channel: "manual",
      commission_cents: 500
    },
    {
      collection_state: "collected_cash",
      settlement_channel: "manual",
      commission_cents: 200
    },
    {
      collection_state: "collected_stripe",
      settlement_channel: "stripe",
      stripe_event_id: "evt_1",
      commission_cents: 300
    }
  ]);
  assert.equal(summary.stripe_collected_cents, 300);
  assert.equal(summary.cash_receivable_cents, 700);
  assert.equal(summary.uncollected_cents, 500);
  assert.match(summary.warning, /Never present cash_receivable/i);
});
