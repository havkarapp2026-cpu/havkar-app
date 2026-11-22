const { createClient } = require("@supabase/supabase-js");
const { isOwnerIdentity } = require("./owner-eur1-checkout.cjs");
const {
  documentsToCsv,
  evaluateIssuanceGates,
  buildReceiptHtml,
  buildReceiptFromPayment,
  nextDocumentNumber
} = require("./havkar-finance-documents.cjs");
const {
  buildReceiptPdf,
  buildOwnerReportPdf
} = require("./havkar-finance-pdf.cjs");
const {
  postStellarSettlementAccounting
} = require("./havkar-finance-stellar.cjs");

function env(name) {
  return String(process.env[name] || "").trim();
}

function getAdminClient() {
  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const service =
    env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_KEY");
  if (!url || !service) {
    return { ok: false, error: "supabase_config_missing" };
  }
  return {
    ok: true,
    client: createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  };
}

function bearerToken(req) {
  const auth = String((req && req.headers && req.headers.authorization) || "");
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

async function authenticateBearer(req, db) {
  const token = bearerToken(req);
  if (!token) {
    return { ok: false, error: "missing_bearer_token", httpStatus: 401 };
  }
  const { data, error } = await db.auth.getUser(token);
  if (error || !data || !data.user) {
    return { ok: false, error: "invalid_or_expired_session", httpStatus: 401 };
  }
  return { ok: true, user: data.user };
}

function sessionRole(user) {
  const meta = (user && user.app_metadata) || {};
  return String(meta.havkar_role || meta.role || "")
    .trim()
    .toLowerCase();
}

function isOwnerUser(user) {
  return isOwnerIdentity(user) || sessionRole(user) === "owner";
}

async function writeAudit(db, actorId, action, detail) {
  try {
    await db.from("havkar_finance_audit_events").insert({
      actor_user_id: actorId || null,
      action: String(action || "access"),
      detail: detail || {}
    });
  } catch (_err) {
    /* audit must never block finance reads */
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function buildOwnerSummary(db, fromIso, toIso) {
  let entriesQuery = db
    .from("havkar_finance_journal_entries")
    .select("id,occurred_at,currency,reconciliation_status,source_system");
  if (fromIso) entriesQuery = entriesQuery.gte("occurred_at", fromIso);
  if (toIso) entriesQuery = entriesQuery.lte("occurred_at", toIso);
  const entries = await entriesQuery;
  if (entries.error) return { error: entries.error };

  const docs = await db
    .from("havkar_finance_documents")
    .select("document_kind,status,amount_cents,currency,sdi_status");
  if (docs.error) return { error: docs.error };

  const lines = await db
    .from("havkar_finance_journal_lines")
    .select("account_code,debit_cents,credit_cents,entry_id");
  if (lines.error) return { error: lines.error };

  const accounts = await db
    .from("havkar_finance_accounts")
    .select("code,account_type,is_havkar_owned");
  if (accounts.error) return { error: accounts.error };

  const gates = await db
    .from("havkar_finance_issuance_gates")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (gates.error) return { error: gates.error };

  const accountMap = {};
  (accounts.data || []).forEach((row) => {
    accountMap[row.code] = row;
  });
  const entryIds = new Set((entries.data || []).map((e) => e.id));

  let revenue_credit_cents = 0;
  let expense_debit_cents = 0;
  let seller_liability_credit_cents = 0;
  (lines.data || []).forEach((line) => {
    if (!entryIds.has(line.entry_id)) return;
    const acct = accountMap[line.account_code] || {};
    if (acct.account_type === "revenue" && acct.is_havkar_owned) {
      revenue_credit_cents += Number(line.credit_cents || 0);
    }
    if (acct.account_type === "expense") {
      expense_debit_cents += Number(line.debit_cents || 0);
    }
    if (line.account_code === "2000") {
      seller_liability_credit_cents += Number(line.credit_cents || 0);
    }
  });

  const receipt_count = (docs.data || []).filter(
    (d) => d.document_kind === "payment_receipt"
  ).length;
  const tax_invoice_count = (docs.data || []).filter(
    (d) => d.document_kind === "tax_invoice"
  ).length;

  const stripeLiveCount = (entries.data || []).filter(
    (e) => String(e.source_system || "").indexOf("stripe") === 0
  ).length;
  const stellarCount = (entries.data || []).filter(
    (e) => String(e.source_system || "").indexOf("stellar") === 0
  ).length;

  return {
    data: {
      journal_entries: (entries.data || []).length,
      journal_entry_count: (entries.data || []).length,
      receipt_count,
      tax_invoice_count,
      revenue_credits_cents: revenue_credit_cents,
      revenue_credit_cents,
      expense_debits_cents: expense_debit_cents,
      expense_debit_cents,
      seller_payables_credit_cents: seller_liability_credit_cents,
      seller_liability_credit_cents,
      unreconciled_count: (entries.data || []).filter(
        (e) => e.reconciliation_status === "unreconciled"
      ).length,
      stripe_webhook_events_live: stripeLiveCount,
      stellar_settlements: stellarCount,
      documents: {
        receipts: receipt_count,
        tax_invoices: tax_invoice_count
      },
      issuance_gates: gates.data || null
    }
  };
}

async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed" });
  }

  const admin = getAdminClient();
  if (!admin.ok) {
    return send(res, 500, { error: admin.error });
  }
  const db = admin.client;

  const auth = await authenticateBearer(req, db);
  if (!auth.ok) {
    return send(res, auth.httpStatus || 401, { error: auth.error });
  }
  const user = auth.user;
  const owner = isOwnerUser(user);
  const action = String(
    (req.query && req.query.action) ||
      (req.body && req.body.action) ||
      "summary"
  );

  if (action === "summary") {
    if (!owner) {
      return send(res, 403, { error: "owner_only" });
    }
    const from = req.query && req.query.from ? String(req.query.from) : null;
    const to = req.query && req.query.to ? String(req.query.to) : null;
    const summary = await buildOwnerSummary(db, from, to);
    if (summary.error) {
      return send(res, 400, { error: summary.error.message });
    }
    await writeAudit(db, user.id, "owner_summary", { from, to });
    return send(res, 200, { ok: true, summary: summary.data });
  }

  if (action === "my_receipts") {
    const { data, error } = await db
      .from("havkar_finance_documents")
      .select(
        "id,document_number,document_kind,status,issue_date,currency,amount_cents,tax_cents,payment_reference,sdi_status,source_object_id"
      )
      .eq("customer_user_id", user.id)
      .order("issue_date", { ascending: false })
      .limit(100);
    if (error) {
      return send(res, 400, { error: error.message });
    }
    return send(res, 200, { ok: true, documents: data || [] });
  }

  if (action === "document") {
    const id = Number(
      (req.query && req.query.id) || (req.body && req.body.id) || 0
    );
    if (!id) {
      return send(res, 400, { error: "document id required" });
    }
    const { data, error } = await db
      .from("havkar_finance_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return send(res, 400, { error: error.message });
    }
    if (!data) {
      return send(res, 404, { error: "not_found" });
    }
    const isCustomer =
      data.customer_user_id && String(data.customer_user_id) === String(user.id);
    if (!owner && !isCustomer) {
      return send(res, 403, { error: "forbidden" });
    }
    await writeAudit(db, user.id, "document_read", {
      document_id: id,
      document_number: data.document_number
    });
    if (String(req.query.format || "") === "html") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'inline; filename="' + data.document_number + '.html"'
      );
      res.end(
        data.html_body ||
          buildReceiptHtml(data, {
            legalEntityName: data.seller_legal_name,
            registeredAddress: data.seller_address,
            reaNumber: data.seller_rea,
            partitaIva: data.seller_partita_iva || ""
          })
      );
      return;
    }
    if (String(req.query.format || "") === "pdf") {
      const pdf = buildReceiptPdf(data);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="' + data.document_number + '.pdf"'
      );
      res.end(pdf);
      return;
    }
    return send(res, 200, { ok: true, document: data });
  }

  if (action === "export_csv") {
    if (!owner) {
      return send(res, 403, { error: "owner_only" });
    }
    const { data, error } = await db
      .from("havkar_finance_documents")
      .select(
        "document_number,document_kind,status,issue_date,currency,amount_cents,tax_cents,payment_reference,sdi_status,customer_email"
      )
      .order("issue_date", { ascending: false })
      .limit(5000);
    if (error) {
      return send(res, 400, { error: error.message });
    }
    await writeAudit(db, user.id, "export_csv", {
      rows: (data || []).length
    });
    const csv = documentsToCsv(data || []);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="havkar-finance-documents.csv"'
    );
    res.end(csv);
    return;
  }

  if (action === "issuance_gates") {
    if (!owner) {
      return send(res, 403, { error: "owner_only" });
    }
    const { data, error } = await db
      .from("havkar_finance_issuance_gates")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      return send(res, 400, { error: error.message });
    }
    return send(res, 200, {
      ok: true,
      gates: data,
      evaluation: evaluateIssuanceGates(data, {
        partitaIva: (data && data.partita_iva_published) || ""
      })
    });
  }

  if (action === "search") {
    if (!owner) {
      return send(res, 403, { error: "owner_only" });
    }
    const q = String((req.query && req.query.q) || "").trim();
    if (!q) {
      return send(res, 400, { error: "q required" });
    }
    const safe = q.replace(/[%(),]/g, "");
    const { data, error } = await db
      .from("havkar_finance_documents")
      .select(
        "id,document_number,document_kind,status,issue_date,amount_cents,currency,payment_reference,sdi_status"
      )
      .or(
        "document_number.ilike.%" +
          safe +
          "%,payment_reference.ilike.%" +
          safe +
          "%,source_object_id.ilike.%" +
          safe +
          "%"
      )
      .order("issue_date", { ascending: false })
      .limit(50);
    if (error) {
      return send(res, 400, { error: error.message });
    }
    await writeAudit(db, user.id, "search", { q: safe });
    return send(res, 200, { ok: true, documents: data || [] });
  }

  if (action === "export_pdf_report") {
    if (!owner) {
      return send(res, 403, { error: "owner_only" });
    }
    const from = req.query && req.query.from ? String(req.query.from) : null;
    const to = req.query && req.query.to ? String(req.query.to) : null;
    const summary = await buildOwnerSummary(db, from, to);
    if (summary.error) {
      return send(res, 400, { error: summary.error.message });
    }
    const docs = await db
      .from("havkar_finance_documents")
      .select(
        "document_number,document_kind,issue_date,amount_cents,payment_reference,currency"
      )
      .order("issue_date", { ascending: false })
      .limit(100);
    if (docs.error) {
      return send(res, 400, { error: docs.error.message });
    }
    await writeAudit(db, user.id, "export_pdf_report", { from, to });
    const pdf = buildOwnerReportPdf(summary.data, docs.data || []);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="havkar-owner-finance-report.pdf"'
    );
    res.end(pdf);
    return;
  }

  if (action === "backfill_stellar_settlements") {
    if (!owner) {
      return send(res, 403, { error: "owner_only" });
    }
    // Posts ledger+receipt for already-settled Stellar intents. Never moves funds.
    const intents = await db
      .from("marketplace_payment_intents")
      .select(
        "id,user_id,flow,amount,currency,network,status,amount_xlm,eur_per_xlm,destination,tx_hash,payer_account,refund_tx_hash,settled_at"
      )
      .eq("status", "settled")
      .not("tx_hash", "is", null)
      .limit(50);
    if (intents.error) {
      return send(res, 400, { error: intents.error.message });
    }
    const results = [];
    for (const intent of intents.data || []) {
      const network = String(intent.network || "").toLowerCase();
      const horizon =
        network === "mainnet"
          ? "https://horizon.stellar.org"
          : "https://horizon-testnet.stellar.org";
      let feeCharged = null;
      let operationId = null;
      let horizonCreated = null;
      try {
        const txRes = await fetch(horizon + "/transactions/" + intent.tx_hash);
        if (txRes.ok) {
          const tx = await txRes.json();
          if (tx.successful !== true) {
            results.push({
              id: intent.id,
              ok: false,
              error: "horizon_not_successful"
            });
            continue;
          }
          feeCharged = tx.fee_charged;
          horizonCreated = tx.created_at;
        }
        const payRes = await fetch(
          horizon + "/transactions/" + intent.tx_hash + "/payments?limit=5"
        );
        if (payRes.ok) {
          const pays = await payRes.json();
          const op =
            pays &&
            pays._embedded &&
            pays._embedded.records &&
            pays._embedded.records[0];
          operationId = op && op.id;
        }
      } catch (err) {
        results.push({
          id: intent.id,
          ok: false,
          error: "horizon_fetch_failed"
        });
        continue;
      }
      const posted = await postStellarSettlementAccounting(db, intent, {
        fee_charged_stroops: feeCharged,
        operation_id: operationId,
        horizon_created_at: horizonCreated
      });
      if (posted.posted) {
        const existing = await db
          .from("havkar_finance_documents")
          .select("id")
          .eq("payment_reference", intent.tx_hash)
          .maybeSingle();
        if (!existing.data) {
          const countRes = await db
            .from("havkar_finance_documents")
            .select("id", { count: "exact", head: true })
            .eq("document_kind", "payment_receipt");
          const receipt = buildReceiptFromPayment({
            document_number: nextDocumentNumber(
              "payment_receipt",
              Number(countRes.count || 0) + 1
            ),
            amount_cents: Math.round(Number(intent.amount) * 100),
            currency: intent.currency || "EUR",
            customer_user_id: intent.user_id,
            payment_reference: intent.tx_hash,
            source_object_id: String(intent.id),
            journal_entry_id: posted.entry_id,
            description: "Stellar " + network + " settlement (backfill)"
          });
          if (receipt.ok) {
            await db.from("havkar_finance_documents").insert(receipt.document);
          }
        }
      }
      results.push({
        id: intent.id,
        tx_hash: intent.tx_hash,
        ok: Boolean(posted.ok),
        duplicate: Boolean(posted.duplicate),
        posted: Boolean(posted.posted),
        entry_ref: posted.entry_ref || null,
        error: posted.error || null
      });
    }
    await writeAudit(db, user.id, "backfill_stellar_settlements", {
      count: results.length
    });
    return send(res, 200, { ok: true, results });
  }

  return send(res, 400, { error: "unknown_action" });
}

module.exports = {
  handler,
  isOwnerUser,
  getAdminClient,
  authenticateBearer
};
