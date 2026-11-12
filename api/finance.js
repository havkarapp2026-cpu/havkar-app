import { createClient } from "@supabase/supabase-js";
import {
  documentsToCsv,
  evaluateIssuanceGates,
  buildReceiptHtml
} from "../lib/havkar-finance-documents.cjs";

function env(name) {
  return String(process.env[name] || "").trim();
}

function supabaseFromRequest(req) {
  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const anon =
    env("SUPABASE_ANON_KEY") ||
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    env("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anon) {
    return { ok: false, error: "supabase_config_missing" };
  }
  const auth = String(req.headers.authorization || "");
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!token) {
    return { ok: false, error: "missing_bearer_token", httpStatus: 401 };
  }
  const client = createClient(url, anon, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return { ok: true, client };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed" });
  }

  const auth = supabaseFromRequest(req);
  if (!auth.ok) {
    return send(res, auth.httpStatus || 500, { error: auth.error });
  }
  const db = auth.client;
  const action = String(
    (req.query && req.query.action) ||
      (req.body && req.body.action) ||
      "summary"
  );

  if (action === "summary") {
    const from = req.query && req.query.from ? String(req.query.from) : null;
    const to = req.query && req.query.to ? String(req.query.to) : null;
    const { data, error } = await db.rpc("havkar_owner_finance_accounting_summary", {
      p_from: from,
      p_to: to
    });
    if (error) {
      return send(res, error.code === "42501" ? 403 : 400, {
        error: error.message
      });
    }
    return send(res, 200, { ok: true, summary: data });
  }

  if (action === "my_receipts") {
    const { data: userData, error: userError } = await db.auth.getUser();
    if (userError || !userData || !userData.user) {
      return send(res, 401, { error: "not_authenticated" });
    }
    const { data, error } = await db
      .from("havkar_finance_documents")
      .select(
        "id,document_number,document_kind,status,issue_date,currency,amount_cents,tax_cents,payment_reference,sdi_status,source_object_id"
      )
      .eq("customer_user_id", userData.user.id)
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
    return send(res, 200, { ok: true, document: data });
  }

  if (action === "export_csv") {
    const { data, error } = await db
      .from("havkar_finance_documents")
      .select(
        "document_number,document_kind,status,issue_date,currency,amount_cents,tax_cents,payment_reference,sdi_status,customer_email"
      )
      .order("issue_date", { ascending: false })
      .limit(5000);
    if (error) {
      return send(res, error.code === "42501" ? 403 : 400, {
        error: error.message
      });
    }
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
    const { data, error } = await db
      .from("havkar_finance_issuance_gates")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      return send(res, error.code === "42501" ? 403 : 400, {
        error: error.message
      });
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
    const q = String((req.query && req.query.q) || "").trim();
    if (!q) {
      return send(res, 400, { error: "q required" });
    }
    const { data, error } = await db
      .from("havkar_finance_documents")
      .select(
        "id,document_number,document_kind,status,issue_date,amount_cents,currency,payment_reference,sdi_status"
      )
      .or(
        "document_number.ilike.%" +
          q +
          "%,payment_reference.ilike.%" +
          q +
          "%,source_object_id.ilike.%" +
          q +
          "%"
      )
      .order("issue_date", { ascending: false })
      .limit(50);
    if (error) {
      return send(res, error.code === "42501" ? 403 : 400, {
        error: error.message
      });
    }
    return send(res, 200, { ok: true, documents: data || [] });
  }

  return send(res, 400, { error: "unknown_action" });
}
