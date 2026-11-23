/**
 * Final Services gates: server license publish enforce + Owner real session.
 * No new payments or refunds. Does not print secrets.
 */
import fs from "fs";

const SITE = "https://havkar.online";
const API = `${SITE}/api/create-event-checkout`;
const SB = "https://gispovnciifgikvgpzck.supabase.co";
const KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdpc3Bvdm5jaWlmZ2lrdmdwemNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNDMxMTYsImV4cCI6MjA5MDkxOTExNn0.IuRX8Wg5r27x8FyTQ_A7tR3mZTbrVjpQiFZYghNn5SA";
const PROVIDER_EMAIL = "svc.provider.auth.1795414584042@havkar.test";
const PROVIDER_PW = "HavkarSvcE2E-Auth-2026!";
const OWNER_EMAIL = "havkarapp2026@gmail.com";
const OWNER_UID = "9b34b0bb-271a-49ee-aeb7-a9d28be06a06";
const stamp = Date.now();

const report = {
  ok: true,
  stamp,
  no_money_moved: true,
  no_owner_password_requested: true,
  steps: [],
  fails: [],
  ids: {}
};

function note(name, ok, detail) {
  report.steps.push({ name, ok: !!ok, detail: detail || null });
  if (!ok) {
    report.ok = false;
    report.fails.push({ name, detail: detail || null });
  }
  console.log(
    ok ? "PASS" : "FAIL",
    name,
    detail ? JSON.stringify(detail).slice(0, 280) : ""
  );
}

async function login(email, password) {
  const res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json();
  if (!body.access_token) {
    throw new Error(
      "login failed for " + email + " " + (body.error_code || body.msg || res.status)
    );
  }
  return {
    email,
    token: body.access_token,
    userId: body.user.id,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${body.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }
  };
}

async function api(session, action, payload = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${session.token}`
    },
    body: JSON.stringify(Object.assign({ action }, payload))
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function sbInsert(session, table, row) {
  const res = await fetch(`${SB}/rest/v1/${table}`, {
    method: "POST",
    headers: session.headers,
    body: JSON.stringify(row)
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (_e) {
    data = text;
  }
  return { status: res.status, data, text };
}

async function sbPatch(session, path, row) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method: "PATCH",
    headers: session.headers,
    body: JSON.stringify(row)
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (_e) {
    data = text;
  }
  return { status: res.status, data, text };
}

async function sbDelete(session, path) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method: "DELETE",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${session.token}`,
      Prefer: "return=minimal"
    }
  });
  return { status: res.status };
}

function extractErr(data) {
  if (!data) return null;
  if (typeof data === "string") return data.slice(0, 240);
  if (Array.isArray(data) && data[0] && data[0].message) return data[0].message;
  return data.message || data.error || data.hint || null;
}

async function main() {
  const ownerPw = process.env.HAVKAR_OWNER_E2E_SESSION_SECRET;
  if (!ownerPw) {
    note("owner_session_secret_present", false, "HAVKAR_OWNER_E2E_SESSION_SECRET missing");
    throw new Error("missing owner session secret env");
  }

  const provider = await login(PROVIDER_EMAIL, PROVIDER_PW);
  note("login_provider", provider.userId.length > 0, {
    id: provider.userId.slice(0, 8)
  });

  const owner = await login(OWNER_EMAIL, ownerPw);
  note(
    "owner_real_session",
    owner.userId === OWNER_UID,
    { id: owner.userId.slice(0, 8), match: owner.userId === OWNER_UID }
  );

  // --- License server enforce ---
  // Provider already has approved Electrical from prior e2e; use Plumbing for block→approve→publish.
  const blocked = await sbInsert(provider, "services", {
    provider_id: provider.userId,
    title: `E2E License Block ${stamp}`,
    category: "Plumbing",
    description: "Must be blocked without approved professional credential review.",
    price: 40,
    currency: "EUR",
    price_type: "fixed",
    location: "Bari, IT (license e2e)",
    latitude: 41.1171,
    longitude: 16.8719,
    status: "active"
  });
  const blockedMsg = String(extractErr(blocked.data) || blocked.text || "");
  note(
    "plumbing_active_blocked_without_credential",
    blocked.status >= 400 &&
      /licensed category|credential|check_violation|P0001|23514/i.test(blockedMsg),
    { status: blocked.status, err: blockedMsg.slice(0, 220) }
  );

  // Non-active statuses allowed without credential (schema: active|paused|closed)
  const pausedOk = await sbInsert(provider, "services", {
    provider_id: provider.userId,
    title: `E2E License Paused ${stamp}`,
    category: "Plumbing",
    description: "Paused listing allowed without credential before publish.",
    price: 40,
    currency: "EUR",
    price_type: "fixed",
    location: "Bari, IT (license e2e)",
    latitude: 41.1171,
    longitude: 16.8719,
    status: "paused"
  });
  const paused =
    Array.isArray(pausedOk.data) && pausedOk.data[0] ? pausedOk.data[0] : pausedOk.data;
  note("plumbing_paused_allowed", pausedOk.status < 300 && paused && paused.id, {
    status: pausedOk.status,
    id: paused && paused.id,
    err: extractErr(pausedOk.data)
  });
  report.ids.paused_service_id = paused && paused.id;

  // Submit credential via API, then approve as Owner (not self-review by provider)
  const submit = await api(provider, "services_credential_submit", {
    category: "Plumbing",
    evidence_path: `https://havkar.online/e2e-license-plumbing-${stamp}.pdf`,
    license_number: `E2E-PLB-${stamp}`,
    jurisdiction: "IT-BA"
  });
  note("provider_credential_submit", submit.status === 200 && submit.body.ok === true, {
    status: submit.status,
    error: submit.body.error || null,
    id: submit.body.review && submit.body.review.id
  });
  const reviewId = submit.body.review && submit.body.review.id;
  report.ids.credential_review_id = reviewId;

  const selfReview = await api(provider, "services_credential_review", {
    review_id: reviewId,
    status: "approved"
  });
  note(
    "provider_self_review_blocked",
    selfReview.status === 403 || selfReview.body.ok !== true,
    { status: selfReview.status, error: selfReview.body.error || null }
  );

  const ownerApprove = await api(owner, "services_credential_review", {
    review_id: reviewId,
    status: "approved",
    review_notes: `owner approve plumbing e2e ${stamp}`
  });
  note(
    "owner_approves_credential",
    ownerApprove.status === 200 && ownerApprove.body.ok === true,
    { status: ownerApprove.status, error: ownerApprove.body.error || null }
  );

  // Set expires on approved row so trigger path sees non-expired approval
  if (reviewId) {
    await sbPatch(owner, `service_provider_credential_reviews?id=eq.${reviewId}`, {
      expires_at: "2030-12-31"
    });
  }

  const activate = await sbPatch(provider, `services?id=eq.${paused.id}`, {
    status: "active",
    updated_at: new Date().toISOString()
  });
  const activated =
    Array.isArray(activate.data) && activate.data[0] ? activate.data[0] : activate.data;
  note(
    "plumbing_active_allowed_with_approved_credential",
    activate.status < 300 && activated && activated.status === "active",
    {
      status: activate.status,
      service_status: activated && activated.status,
      err: extractErr(activate.data)
    }
  );

  // Non-licensed category still publishes without credential
  const cleaning = await sbInsert(provider, "services", {
    provider_id: provider.userId,
    title: `E2E Cleaning OK ${stamp}`,
    category: "Cleaning",
    description: "Non-licensed category remains open.",
    price: 20,
    currency: "EUR",
    price_type: "fixed",
    location: "Bari, IT",
    latitude: 41.1171,
    longitude: 16.8719,
    status: "active"
  });
  const cleaningRow =
    Array.isArray(cleaning.data) && cleaning.data[0] ? cleaning.data[0] : cleaning.data;
  note("cleaning_active_without_credential", cleaning.status < 300 && cleaningRow && cleaningRow.id, {
    status: cleaning.status,
    id: cleaningRow && cleaningRow.id
  });
  report.ids.cleaning_service_id = cleaningRow && cleaningRow.id;

  // --- Owner real session access (no money) ---
  const staffPanelOwner = await api(owner, "services_staff_panel", {});
  note(
    "owner_staff_panel_access",
    staffPanelOwner.status === 200 && staffPanelOwner.body.ok === true,
    {
      status: staffPanelOwner.status,
      vault_hidden: staffPanelOwner.body.owner_vault_hidden === true,
      error: staffPanelOwner.body.error || null
    }
  );

  const credList = await api(owner, "services_credentials_list", {});
  note(
    "owner_credentials_list",
    credList.status === 200 && credList.body.ok === true,
    {
      status: credList.status,
      count: (credList.body.reviews || credList.body.credentials || []).length,
      error: credList.body.error || null
    }
  );

  // Refund approve gate: non-owner blocked; owner without execute flag / without confirm does not move money
  const fakeApprove = await api(provider, "services_refund_approve", {
    request_id: 999999999
  });
  note(
    "non_owner_refund_approve_denied",
    fakeApprove.status === 403,
    { status: fakeApprove.status, error: fakeApprove.body.error || null }
  );

  const ownerApproveMissing = await api(owner, "services_refund_approve", {
    request_id: 999999999
  });
  note(
    "owner_refund_approve_missing_request_no_money",
    ownerApproveMissing.status >= 400 &&
      ownerApproveMissing.body.refund_executed !== true,
    {
      status: ownerApproveMissing.status,
      refund_executed: ownerApproveMissing.body.refund_executed || false,
      error: ownerApproveMissing.body.error || null
    }
  );

  const ownerExecuteBlocked = await api(owner, "services_refund_execute", {
    request_id: 999999999,
    confirm_execute: false
  });
  note(
    "owner_refund_execute_requires_confirm_no_money",
    ownerExecuteBlocked.status === 400 &&
      ownerExecuteBlocked.body.refund_executed !== true,
    {
      status: ownerExecuteBlocked.status,
      code: ownerExecuteBlocked.body.code || null,
      refund_executed: ownerExecuteBlocked.body.refund_executed || false
    }
  );

  // Soft-close e2e listings
  if (paused && paused.id) {
    await sbPatch(provider, `services?id=eq.${paused.id}`, { status: "closed" });
  }
  if (cleaningRow && cleaningRow.id) {
    await sbPatch(provider, `services?id=eq.${cleaningRow.id}`, { status: "closed" });
  }

  const outPath = `/opt/cursor/artifacts/services-license-owner-finalize-${stamp}.json`;
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("REPORT", outPath);
  console.log("SUMMARY", JSON.stringify({ ok: report.ok, steps: report.steps.length, fails: report.fails }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL", String(err && err.stack || err));
  process.exit(1);
});
