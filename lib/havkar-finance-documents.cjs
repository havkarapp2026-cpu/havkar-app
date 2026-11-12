/*
 * Payment receipts and gated tax-invoice helpers.
 * Never fabricates Partita IVA or marks SDI accepted without gates.
 */

const OPERATOR_DEFAULTS = {
  legalEntityName: "HAVKAR DI JALILNIA AMIR",
  registeredAddress: "Francesco Antonio Lucifero 40, 88900 Crotone, Italy",
  reaNumber: "KR-234170",
  partitaIva: ""
};

function euros(cents) {
  return (Math.round(Number(cents) || 0) / 100).toFixed(2);
}

function evaluateIssuanceGates(gates, operator) {
  const g = gates || {};
  const partita = String(
    (g.partita_iva_published || (operator && operator.partitaIva) || "")
  ).trim();
  const taxEnabled = g.tax_invoicing_enabled === true;
  const sdiEnabled = g.sdi_enabled === true;
  const accountantOk = Boolean(g.accountant_approved_at);

  if (!partita) {
    return {
      can_issue_tax_invoice: false,
      can_queue_sdi: false,
      sdi_status: "blocked_missing_partita",
      reason:
        "Partita IVA is not published. Payment receipts remain available; tax invoices and SDI stay blocked."
    };
  }
  if (!taxEnabled || !accountantOk) {
    return {
      can_issue_tax_invoice: false,
      can_queue_sdi: false,
      sdi_status: "blocked_awaiting_accountant",
      reason:
        "Accountant approval and tax_invoicing_enabled are required before legal tax invoices."
    };
  }
  if (!sdiEnabled) {
    return {
      can_issue_tax_invoice: true,
      can_queue_sdi: false,
      sdi_status: "ready",
      reason: "Tax invoices allowed; SDI transmission still disabled."
    };
  }
  return {
    can_issue_tax_invoice: true,
    can_queue_sdi: true,
    sdi_status: "ready",
    reason: "Tax invoices and SDI queueing enabled."
  };
}

function nextDocumentNumber(kind, sequence) {
  const year = new Date().getUTCFullYear();
  const prefix =
    kind === "tax_invoice"
      ? "FT"
      : kind === "credit_note"
        ? "NC"
        : kind === "statement"
          ? "ST"
          : "RC";
  const seq = String(sequence || 1).padStart(6, "0");
  return prefix + "-" + year + "-" + seq;
}

function buildReceiptHtml(doc, operator) {
  const op = Object.assign({}, OPERATOR_DEFAULTS, operator || {});
  const items = Array.isArray(doc.line_items) ? doc.line_items : [];
  const rows = items
    .map(function (item) {
      return (
        "<tr><td>" +
        String(item.description || "") +
        "</td><td style='text-align:right'>€" +
        euros(item.amount_cents) +
        "</td></tr>"
      );
    })
    .join("");

  return (
    "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<title>" +
    String(doc.document_number) +
    "</title>" +
    "<style>body{font-family:Georgia,serif;max-width:720px;margin:32px auto;color:#123;}" +
    "h1{color:#1b5e20;}table{width:100%;border-collapse:collapse;margin-top:16px;}" +
    "td,th{border-bottom:1px solid #cde;padding:8px;text-align:left;}" +
    ".muted{color:#456;font-size:14px;} .badge{display:inline-block;background:#e8f5e9;color:#1b5e20;padding:4px 8px;border-radius:8px;font-weight:700;}" +
    "</style></head><body>" +
    "<p class=\"badge\">PAYMENT RECEIPT (not a tax invoice / non fattura)</p>" +
    "<h1>HAVKAR</h1>" +
    "<p><strong>" +
    op.legalEntityName +
    "</strong><br>" +
    op.registeredAddress +
    "<br>REA " +
    op.reaNumber +
    (op.partitaIva
      ? "<br>Partita IVA " + op.partitaIva
      : "<br><em>Partita IVA not published</em>") +
    "</p>" +
    "<p>Document: <strong>" +
    String(doc.document_number) +
    "</strong><br>Issue date: " +
    String(doc.issue_date) +
    "<br>Payment reference: " +
    String(doc.payment_reference || doc.source_object_id || "—") +
    "</p>" +
    "<table><thead><tr><th>Description</th><th style='text-align:right'>Amount</th></tr></thead><tbody>" +
    rows +
    "<tr><th>Total</th><th style='text-align:right'>€" +
    euros(doc.amount_cents) +
    " " +
    String(doc.currency || "EUR") +
    "</th></tr></tbody></table>" +
    "<p class=\"muted\">This receipt confirms a successful payment recorded by HAVKAR. " +
    "It is not an Italian electronic invoice (FatturaPA / SDI) unless a separate tax invoice is issued under an enabled legal gate. " +
    "Third-party seller goods amounts are not treated as HAVKAR taxable turnover.</p>" +
    "</body></html>"
  );
}

function csvEscape(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function documentsToCsv(rows) {
  const header = [
    "document_number",
    "document_kind",
    "status",
    "issue_date",
    "currency",
    "amount_cents",
    "tax_cents",
    "payment_reference",
    "sdi_status",
    "customer_email"
  ];
  const lines = [header.join(",")];
  (rows || []).forEach(function (row) {
    lines.push(
      [
        row.document_number,
        row.document_kind,
        row.status,
        row.issue_date,
        row.currency,
        row.amount_cents,
        row.tax_cents,
        row.payment_reference,
        row.sdi_status,
        row.customer_email
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  return lines.join("\n") + "\n";
}

function buildReceiptFromPayment(input) {
  const amount = Number(input.amount_cents || 0);
  const kind = "payment_receipt";
  const evaluation = evaluateIssuanceGates(input.gates, input.operator);
  const doc = {
    document_number: input.document_number,
    document_kind: kind,
    status: "issued",
    currency: String(input.currency || "EUR").toUpperCase(),
    amount_cents: amount,
    tax_cents: 0,
    issue_date: input.issue_date || new Date().toISOString().slice(0, 10),
    customer_user_id: input.customer_user_id || null,
    customer_email: input.customer_email || null,
    journal_entry_id: input.journal_entry_id || null,
    source_object_id: input.source_object_id || null,
    payment_reference: input.payment_reference || input.source_object_id || null,
    seller_legal_name:
      (input.operator && input.operator.legalEntityName) ||
      OPERATOR_DEFAULTS.legalEntityName,
    seller_address:
      (input.operator && input.operator.registeredAddress) ||
      OPERATOR_DEFAULTS.registeredAddress,
    seller_rea:
      (input.operator && input.operator.reaNumber) || OPERATOR_DEFAULTS.reaNumber,
    seller_partita_iva:
      (input.gates && input.gates.partita_iva_published) ||
      (input.operator && input.operator.partitaIva) ||
      null,
    line_items: input.line_items || [
      {
        description: input.description || "HAVKAR payment",
        amount_cents: amount
      }
    ],
    sdi_status: "not_applicable",
    metadata: Object.assign({}, input.metadata || {}, {
      issuance: evaluation,
      not_a_tax_invoice: true
    })
  };
  doc.html_body = buildReceiptHtml(doc, input.operator);
  return { ok: true, document: doc, issuance: evaluation };
}

module.exports = {
  OPERATOR_DEFAULTS,
  evaluateIssuanceGates,
  nextDocumentNumber,
  buildReceiptHtml,
  documentsToCsv,
  buildReceiptFromPayment,
  euros
};
