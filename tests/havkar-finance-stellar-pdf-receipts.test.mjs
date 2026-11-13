import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildEntryFromStellarIntent,
  networkFeeEurCents
} from "../lib/havkar-finance-stellar.cjs";
import { assertBalanced } from "../lib/havkar-finance-ledger.cjs";
import {
  buildReceiptPdf,
  buildOwnerReportPdf
} from "../lib/havkar-finance-pdf.cjs";
import { evaluateIssuanceGates } from "../lib/havkar-finance-documents.cjs";

const intent = {
  id: "39f59f21-ddd3-45ee-927a-87e6efc56641",
  status: "settled",
  network: "mainnet",
  flow: "marketplace",
  amount: 1.02,
  amount_xlm: "7.7528218",
  eur_per_xlm: "0.131565",
  currency: "EUR",
  tx_hash:
    "92781d576093b96e2a92295bc731f555dede8838b0624f61ed20522fdf4c8811",
  destination: "GBORWHZDJRQQQIWHS7YZ5GQDSGV6KKKTVCHNZGULACUK7SCAAHEAUTGM",
  payer_account: "GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L",
  settled_at: "2026-11-09T23:16:51.754Z"
};

const built = buildEntryFromStellarIntent(intent, {
  fee_charged_stroops: "100",
  operation_id: "280859001091002369"
});
assert.equal(built.ok, true);
assert.equal(built.entry.source_system, "stellar_mainnet");
assert.equal(built.entry.source_event_id.indexOf(intent.tx_hash), 0);
assert.equal(
  built.lines.some((l) => l.account_code === "1050" && l.debit_cents === 102),
  true
);
assert.equal(
  built.lines.some((l) => l.account_code === "2000" && l.credit_cents === 97),
  true
);
assert.equal(
  built.lines.some((l) => l.account_code === "4000" && l.credit_cents === 5),
  true
);
assert.equal(
  built.lines.some((l) => l.account_code === "1000"),
  false
);
assertBalanced(built.lines);
assert.equal(built.entry.metadata.reconciliation, "stellar_separate_from_stripe");
assert.ok(networkFeeEurCents(100, 0.131565) >= 0);

const pdf = buildReceiptPdf({
  document_number: "RC-2026-000099",
  document_kind: "payment_receipt",
  status: "issued",
  issue_date: "2026-11-12",
  sdi_status: "not_applicable",
  seller_legal_name: "HAVKAR DI JALILNIA AMIR",
  amount_cents: 102,
  tax_cents: 0,
  currency: "EUR",
  payment_reference: intent.tx_hash
});
assert.ok(Buffer.isBuffer(pdf));
assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
assert.match(pdf.toString("latin1"), /PAYMENT RECEIPT/);
assert.doesNotMatch(pdf.toString("latin1"), /FatturaPA accepted/);

const report = buildOwnerReportPdf(
  { journal_entry_count: 1, receipt_count: 1, revenue_credit_cents: 5 },
  [{ document_number: "RC-2026-000099", document_kind: "payment_receipt", issue_date: "2026-11-12", amount_cents: 102 }]
);
assert.equal(report.subarray(0, 5).toString("utf8"), "%PDF-");

const gates = evaluateIssuanceGates({
  tax_invoicing_enabled: false,
  sdi_enabled: false,
  partita_iva_published: null
});
assert.equal(gates.can_issue_tax_invoice, false);
assert.equal(gates.can_queue_sdi, false);

const migration = fs.readFileSync(
  "supabase/migrations/20261112210000_stellar_pdf_sdi_message_receipts.sql",
  "utf8"
);
assert.match(migration, /havkar_mark_messages_delivered/);
assert.match(migration, /havkar_mark_messages_read/);
assert.match(migration, /delivered_at/);
assert.match(migration, /havkar_finance_sdi_submissions/);
assert.match(migration, /tax_invoicing_enabled = false/);
assert.match(migration, /sdi_enabled = false/);
assert.match(migration, /REVOKE UPDATE ON TABLE public\.messages/);

const chat = fs.readFileSync("chat.html", "utf8");
assert.match(chat, /havkar_mark_messages_delivered/);
assert.match(chat, /havkar_mark_messages_read/);
assert.match(chat, /messageReceiptState/);
assert.match(chat, /applyMessageChecks/);
assert.match(chat, /text-shadow:[\s\S]*255,\s*213,\s*79/);
assert.doesNotMatch(
  chat.slice(chat.indexOf("async function markMessagesRead"), chat.indexOf("async function prepareChatRealtimeAuth")),
  /\.update\(\{\s*is_read:\s*true/
);

const stellarCheckout = fs.readFileSync("lib/stellar-checkout.cjs", "utf8");
assert.match(stellarCheckout, /postStellarSettlementAccounting/);
assert.match(stellarCheckout, /havkar-finance-stellar/);

console.log("HAVKAR_STELLAR_PDF_RECEIPTS_TEST_OK");
