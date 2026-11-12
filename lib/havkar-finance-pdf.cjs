/*
 * Minimal native PDF writer for HAVKAR payment receipts and Owner reports.
 * No external PDF dependency. Distinguishes payment receipts from tax invoices.
 */

function pdfEscape(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function euros(cents) {
  return (Math.round(Number(cents) || 0) / 100).toFixed(2);
}

function buildContentStream(lines) {
  const ops = ["BT", "/F1 11 Tf", "14 TL", "50 780 Td"];
  lines.forEach(function (line, idx) {
    if (idx === 0) {
      ops.push("(" + pdfEscape(line) + ") Tj");
    } else {
      ops.push("T* (" + pdfEscape(line) + ") Tj");
    }
  });
  ops.push("ET");
  return ops.join("\n");
}

function wrapPdf(contentStream) {
  const objects = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n"
  );
  objects.push(
    "4 0 obj<< /Length " +
      Buffer.byteLength(contentStream, "utf8") +
      " >>stream\n" +
      contentStream +
      "\nendstream\nendobj\n"
  );
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach(function (obj) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += "xref\n0 " + (objects.length + 1) + "\n";
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  pdf +=
    "trailer<< /Size " +
    (objects.length + 1) +
    " /Root 1 0 R >>\nstartxref\n" +
    xrefStart +
    "\n%%EOF\n";
  return Buffer.from(pdf, "utf8");
}

function buildReceiptPdf(doc) {
  const kind = String(doc.document_kind || "payment_receipt");
  const isTax = kind === "tax_invoice";
  const lines = [
    isTax
      ? "HAVKAR TAX INVOICE (gated issuance only)"
      : "HAVKAR PAYMENT RECEIPT (not a tax invoice / non fattura)",
    "",
    "Document: " + String(doc.document_number || ""),
    "Issue date: " + String(doc.issue_date || ""),
    "Status: " + String(doc.status || ""),
    "SDI status: " + String(doc.sdi_status || "not_applicable"),
    "",
    "Seller: " + String(doc.seller_legal_name || "HAVKAR DI JALILNIA AMIR"),
    "Address: " +
      String(
        doc.seller_address ||
          "Francesco Antonio Lucifero 40, 88900 Crotone, Italy"
      ),
    "REA: " + String(doc.seller_rea || "KR-234170"),
    "Partita IVA: " +
      (doc.seller_partita_iva
        ? String(doc.seller_partita_iva)
        : "(published only after verified Visura)"),
    "",
    "Customer: " + String(doc.customer_email || doc.customer_user_id || "n/a"),
    "Payment reference: " + String(doc.payment_reference || ""),
    "Source object: " + String(doc.source_object_id || ""),
    "",
    "Currency: " + String(doc.currency || "EUR"),
    "Amount: EUR " + euros(doc.amount_cents),
    "Tax: EUR " + euros(doc.tax_cents),
    "",
    "This PDF mirrors the immutable finance document record.",
    isTax
      ? "Official tax invoice — only when issuance gates are armed."
      : "This is a payment receipt, not a legally valid Italian tax invoice."
  ];
  return wrapPdf(buildContentStream(lines));
}

function buildOwnerReportPdf(summary, documents) {
  const docs = Array.isArray(documents) ? documents : [];
  const lines = [
    "HAVKAR OWNER FINANCIAL REPORT",
    "(Accountant-ready summary — not a tax invoice)",
    "",
    "Generated: " + new Date().toISOString(),
    "Journal entries: " + String((summary && summary.journal_entry_count) || 0),
    "Receipts: " + String((summary && summary.receipt_count) || 0),
    "Tax invoices: " + String((summary && summary.tax_invoice_count) || 0),
    "Revenue credits (cents): " +
      String((summary && summary.revenue_credit_cents) || 0),
    "Expense debits (cents): " +
      String((summary && summary.expense_debit_cents) || 0),
    "Seller liabilities (cents): " +
      String((summary && summary.seller_liability_credit_cents) || 0),
    "Unreconciled: " + String((summary && summary.unreconciled_count) || 0),
    "",
    "Recent documents:"
  ];
  docs.slice(0, 40).forEach(function (d) {
    lines.push(
      String(d.document_number) +
        " | " +
        String(d.document_kind) +
        " | " +
        String(d.issue_date) +
        " | EUR " +
        euros(d.amount_cents) +
        " | " +
        String(d.payment_reference || "")
    );
  });
  lines.push("");
  lines.push("Stripe and Stellar are reconciled in separate source_system ledgers.");
  return wrapPdf(buildContentStream(lines));
}

module.exports = {
  buildReceiptPdf,
  buildOwnerReportPdf
};
