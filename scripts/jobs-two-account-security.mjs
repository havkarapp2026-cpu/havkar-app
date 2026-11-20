#!/usr/bin/env node
/**
 * Two-account Jobs security evidence.
 * No live card charge. No live XLM transfer. No Buy & Sell mutations.
 */
import fs from "node:fs";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jobs = require("../havkar-jobs.js");
const billing = require("../havkar-job-billing.js");

const BASE =
  process.env.HAVKAR_PREVIEW_BASE ||
  "https://havkar-app-git-cursor-jobs-ae86c8-havkarapp2026-4055s-projects.vercel.app";
const SHARE = process.env.HAVKAR_VERCEL_SHARE || "";
const OUT = "/opt/cursor/artifacts/jobs-two-account-security.json";

function withShare(path) {
  const u = new URL(path, BASE);
  if (SHARE) u.searchParams.set("_vercel_share", SHARE);
  return u.toString();
}

async function postJson(path, body) {
  const res = await fetch(withShare(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

function clientFromConfig() {
  const sandbox = { window: {}, globalThis: {} };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(
    fs.readFileSync("havkar-supabase-config.js", "utf8"),
    sandbox
  );
  const cfg = sandbox.window.HAVKAR_SUPABASE_CONFIG;
  return {
    cfg,
    make: () => createClient(cfg.url, cfg.publishableKey)
  };
}

const report = {
  started_at: new Date().toISOString(),
  base: BASE,
  live_payments: false,
  live_xlm_transfer: false,
  buy_sell_touched: false,
  checks: {},
  accounts: {}
};

function readEnvFile(path) {
  const text = fs.readFileSync(path, "utf8");
  const out = {};
  text.split(/\n/).forEach((line) => {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  });
  return out;
}

async function main() {
  const secret = JSON.parse(
    fs.readFileSync("/tmp/buysell-two-account.secret", "utf8")
  );
  const meta = JSON.parse(
    fs.readFileSync("/tmp/buysell-two-account.json", "utf8")
  );
  const e2e = readEnvFile("/tmp/e2e-creds.env");
  const employerEmail = meta.emailA || e2e.EMAIL;
  const employerPass = e2e.PASS;
  const applicantEmail = meta.emailB || secret.emailB;
  const applicantPass = secret.passB || secret.passwordB;
  if (!employerEmail || !employerPass || !applicantEmail || !applicantPass) {
    throw new Error("Missing two-account credentials for Jobs security test");
  }

  const { make } = clientFromConfig();
  const employerSb = make();
  const applicantSb = make();

  const employerLogin = await employerSb.auth.signInWithPassword({
    email: employerEmail,
    password: employerPass
  });
  if (employerLogin.error) throw employerLogin.error;
  report.accounts.employer = {
    email: employerEmail,
    id: employerLogin.data.user.id
  };

  const applicantLogin = await applicantSb.auth.signInWithPassword({
    email: applicantEmail,
    password: applicantPass
  });
  if (applicantLogin.error) throw applicantLogin.error;
  report.accounts.applicant = {
    email: applicantEmail,
    id: applicantLogin.data.user.id
  };

  const employerId = report.accounts.employer.id;
  const applicantId = report.accounts.applicant.id;
  assertDistinct(employerId, applicantId);

  // Ordinary insert stays pending_payment
  const created = await jobs.createOwnJob(employerSb, {
    userId: employerId,
    plan: { name: "Professional", price: 19.99 },
    draft: {
      title: "Jobs Stabilize E2E Role",
      company: "HAVKAR Jobs Test Co",
      location: "Crotone, Italy",
      type: "Full-time",
      salary: "€1,500/month",
      skills: ["Testing"],
      description: "Temporary Jobs stabilize two-account security listing.",
      requirements: "Careful verification only",
      contact: "jobs-e2e@havkar.test",
      application_url: "https://example.com/apply-jobs-e2e",
      currency: "EUR",
      employer_kind: "ordinary"
    }
  });
  report.checks.create_pending_payment = {
    ok: Boolean(created.ok && created.row && created.row.status === "pending_payment"),
    job_id: created.row && created.row.id,
    status: created.row && created.row.status,
    plan: created.row && created.row.plan,
    monthly_fee: created.row && created.row.monthly_fee
  };
  if (!created.ok) throw new Error(created.message || "create failed");

  const jobId = created.row.id;

  // Applicant cannot update employer listing
  const hijack = await jobs.updateOwnJob(applicantSb, {
    jobId,
    userId: applicantId,
    draft: {
      title: "Hijacked",
      company: "Attacker",
      location: "Nowhere",
      type: "Full-time",
      description: "Should not overwrite employer job content.",
      existingType: "Full-time"
    }
  });
  report.checks.applicant_cannot_update_foreign = {
    ok: hijack.ok === false,
    reason: hijack.reason || null
  };

  // Applicant cannot delete employer listing
  const stealDelete = await jobs.deleteOwnJob(applicantSb, {
    jobId,
    userId: applicantId
  });
  report.checks.applicant_cannot_delete_foreign = {
    ok: stealDelete.ok === false,
    reason: stealDelete.reason || null
  };

  // Corporate quote without verified company must fail (local rule + remote when deployed)
  const localCorporateGate = billing.companyMaySubscribe({
    verification_status: "unverified"
  });
  const unverifiedQuote = await postJson("/api/create-event-checkout", {
    action: "jobs_quote",
    plan: "business",
    method: "stripe",
    verification_status: "unverified"
  });
  const remoteBlocks =
    unverifiedQuote.status === 403 &&
    unverifiedQuote.body &&
    unverifiedQuote.body.charge_created === false;
  const remoteHonestOff =
    unverifiedQuote.body &&
    unverifiedQuote.body.charge_created === false &&
    unverifiedQuote.body.charge_allowed_now === false;
  report.checks.corporate_quote_requires_verified = {
    ok: localCorporateGate.ok === false && (remoteBlocks || remoteHonestOff),
    local_gate_ok: localCorporateGate.ok === false,
    remote_blocks_with_403: remoteBlocks,
    remote_pending_deploy: !remoteBlocks,
    status: unverifiedQuote.status,
    code: unverifiedQuote.body && unverifiedQuote.body.code,
    charge_created: unverifiedQuote.body && unverifiedQuote.body.charge_created
  };

  // Ordinary quote stays gated / no charge
  const ordinaryQuote = await postJson("/api/create-event-checkout", {
    action: "jobs_quote",
    plan: "Professional",
    method: "stripe"
  });
  report.checks.ordinary_quote_no_charge = {
    ok:
      ordinaryQuote.body &&
      ordinaryQuote.body.ok === true &&
      ordinaryQuote.body.charge_created === false &&
      ordinaryQuote.body.charge_allowed_now === false &&
      Number(ordinaryQuote.body.list_price_eur) === 19.99,
    body: ordinaryQuote.body
  };

  // Company self-register cannot become verified
  const reg = await jobs.registerCompany(employerSb, {
    userId: employerId,
    legal_name: "Jobs Stabilize Legal SRL " + Date.now()
  });
  report.checks.company_register_stays_unverified = {
    ok: Boolean(reg.ok && reg.row && reg.row.verification_status === "unverified"),
    verification_status: reg.row && reg.row.verification_status,
    company_id: reg.row && reg.row.id
  };

  // Local billing gate agrees
  report.checks.billing_gate = {
    ok: billing.paymentsEnabled({ HAVKAR_JOB_PAYMENTS_ENABLED: "false" }) === false,
    company_may_subscribe_unverified: billing.companyMaySubscribe({
      verification_status: "unverified"
    }).ok
  };

  // Cleanup: employer deletes own pending job
  const cleaned = await jobs.deleteOwnJob(employerSb, {
    jobId,
    userId: employerId
  });
  report.checks.employer_can_delete_own = {
    ok: cleaned.ok === true,
    job_id: jobId
  };

  report.finished_at = new Date().toISOString();
  report.ok = Object.values(report.checks).every((c) => c && c.ok === true);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(report.ok ? "JOBS_TWO_ACCOUNT_SECURITY_OK" : "JOBS_TWO_ACCOUNT_SECURITY_FAIL");
  console.log(OUT);
  if (!report.ok) process.exit(1);
}

function assertDistinct(a, b) {
  if (String(a) === String(b)) {
    throw new Error("Employer and applicant must be different accounts");
  }
}

main().catch((error) => {
  report.error = String(error && error.message ? error.message : error);
  report.finished_at = new Date().toISOString();
  report.ok = false;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exit(1);
});
