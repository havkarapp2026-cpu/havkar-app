import assert from "node:assert/strict";
import {
  quoteMarketplaceFees,
  quoteServiceFees,
  LISTING_PUBLICATION_FEE_CENTS,
  buildPlatformPaymentEntry,
  buildMarketplaceSplitEntry,
  buildRefundEntry,
  buildEntryFromStripeEvent,
  assertBalanced
} from "../lib/havkar-finance-ledger.cjs";
import {
  evaluateIssuanceGates,
  buildReceiptFromPayment,
  documentsToCsv,
  nextDocumentNumber
} from "../lib/havkar-finance-documents.cjs";
import fs from "node:fs";
import path from "node:path";

assert.equal(LISTING_PUBLICATION_FEE_CENTS, 0);
const market = quoteMarketplaceFees(100);
assert.equal(market.buyer_fee_cents, 200);
assert.equal(market.seller_fee_cents, 300);
assert.equal(market.platform_commission_cents, 500);
assert.equal(market.seller_receives_cents, 9700);
assert.equal(market.buyer_pays_cents, 10200);

const service = quoteServiceFees(100);
assert.equal(service.commission_cents, 1000);
assert.equal(service.provider_receives_cents, 9000);

const platform = buildPlatformPaymentEntry({
  entry_ref: "JE-TEST-1",
  amount_cents: 100,
  stripe_fee_cents: 0,
  memo: "Owner micro"
});
assert.equal(platform.ok, true);
assertBalanced(platform.lines);

const split = buildMarketplaceSplitEntry({
  entry_ref: "JE-TEST-2",
  list_cents: 10000
});
assert.equal(split.ok, true);
assert.equal(split.entry.metadata.seller_gmv_not_havkar_revenue, true);
const revenueLine = split.lines.find((l) => l.account_code === "4000");
const sellerLine = split.lines.find((l) => l.account_code === "2000");
assert.equal(revenueLine.credit_cents, 500);
assert.equal(sellerLine.credit_cents, 9700);

const refund = buildRefundEntry({
  entry_ref: "JE-TEST-3",
  amount_cents: 100
});
assert.equal(refund.ok, true);

const event = {
  id: "evt_test",
  type: "checkout.session.completed",
  livemode: true,
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: "cs_test",
      amount_total: 100,
      currency: "eur",
      payment_status: "paid",
      metadata: { havkar_owner_micro_test: "true" }
    }
  }
};
const built = buildEntryFromStripeEvent(event);
assert.equal(built.ok, true);
assert.equal(built.skipped, undefined);

const gatesBlocked = evaluateIssuanceGates({
  tax_invoicing_enabled: false,
  sdi_enabled: false,
  partita_iva_published: null
});
assert.equal(gatesBlocked.can_issue_tax_invoice, false);
assert.equal(gatesBlocked.sdi_status, "blocked_missing_partita");

const receipt = buildReceiptFromPayment({
  document_number: nextDocumentNumber("payment_receipt", 1),
  amount_cents: 100,
  description: "Owner EUR 1 test",
  gates: gatesBlocked,
  operator: { partitaIva: "" }
});
assert.equal(receipt.ok, true);
assert.equal(receipt.document.document_kind, "payment_receipt");
assert.equal(receipt.document.sdi_status, "not_applicable");
assert.match(receipt.document.html_body, /not a tax invoice/i);

const csv = documentsToCsv([
  {
    document_number: "RC-2026-000001",
    document_kind: "payment_receipt",
    status: "issued",
    issue_date: "2026-11-12",
    currency: "EUR",
    amount_cents: 100,
    tax_cents: 0,
    payment_reference: "cs_live_x",
    sdi_status: "not_applicable",
    customer_email: "a@b.c"
  }
]);
assert.match(csv, /RC-2026-000001/);

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20261112200000_finance_accounting_and_verification_badges.sql"
  ),
  "utf8"
);
assert.match(migration, /havkar_finance_journal_entries/);
assert.match(migration, /havkar_verification_cases/);
assert.match(migration, /tax_invoicing_enabled boolean NOT NULL DEFAULT false/);
assert.match(migration, /sdi_enabled boolean NOT NULL DEFAULT false/);
assert.doesNotMatch(migration, /STELLAR_MAINNET\s*=\s*true/);

const processor = fs.readFileSync(
  path.join(process.cwd(), "lib/stripe-webhook-processor.cjs"),
  "utf8"
);
assert.match(processor, /postAccountingFromEvent/);
assert.match(processor, /havkar-finance-ledger/);

const financeApi = fs.readFileSync(
  path.join(process.cwd(), "lib/havkar-finance-api.cjs"),
  "utf8"
);
assert.match(financeApi, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(financeApi, /isOwnerIdentity/);
assert.match(financeApi, /owner_only/);
assert.doesNotMatch(financeApi, /SUPABASE_ANON_KEY/);

const { isOwnerUser } = await import("../lib/havkar-finance-api.cjs");
assert.equal(
  isOwnerUser({ id: "9b34b0bb-271a-49ee-aeb7-a9d28be06a06" }),
  true
);
assert.equal(
  isOwnerUser({ id: "00000000-0000-0000-0000-000000000000" }),
  false
);

console.log("HAVKAR_FINANCE_LEDGER_TEST_OK");
