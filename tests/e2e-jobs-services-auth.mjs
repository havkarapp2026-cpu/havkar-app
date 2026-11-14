/**
 * Authenticated Jobs + Services + adversarial RLS E2E.
 * Uses isolated @havkar.test accounts. Does not create live charges.
 * Credentials loaded from /tmp/e2e-creds.env and /tmp/e2e-signup.json (not committed).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const applications = require("../havkar-job-applications.js");
const serviceOps = require("../havkar-service-operations.js");

const url = "https://gispovnciifgikvgpzck.supabase.co";
const anon = "sb_publishable_KD8yd063Xik2oMyjevwWYg_tJK2jEKq";
const e2ePass = fs
  .readFileSync("/tmp/e2e-creds.env", "utf8")
  .split("\n")
  .find((l) => l.startsWith("E2E_PASS="))
  .slice(8);
const accounts = JSON.parse(fs.readFileSync("/tmp/e2e-signup.json", "utf8"));
const byRole = {
  applicant: accounts[0],
  employer: accounts[1],
  customer: accounts[2],
  provider: accounts[3]
};

const report = {
  started_at: new Date().toISOString(),
  jobs: {},
  services: {},
  rls: {},
  payments: {},
  failures: []
};

function fail(section, message, detail) {
  report.failures.push({ section, message, detail });
  report[section] = report[section] || {};
  report[section].status = "FAIL";
  report[section].error = message;
  console.error("FAIL", section, message, detail || "");
}

function mark(section, key, value) {
  report[section] = report[section] || {};
  report[section][key] = value;
  if (!report[section].status) report[section].status = "PASS";
}

async function clientFor(role) {
  const email = byRole[role].email;
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: e2ePass });
  if (error || !data.session) {
    throw new Error(role + " sign-in failed: " + (error && error.message));
  }
  return { sb, user: data.user, token: data.session.access_token, email };
}

async function probePayments() {
  const jobsMethods = await fetch("https://havkar.online/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "jobs_payment_methods" })
  }).then((r) => r.json());
  const jobsQuote = await fetch("https://havkar.online/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "jobs_quote",
      method: "xlm_mainnet",
      plan: "Professional"
    })
  }).then((r) => r.json());
  const svcQuote = await fetch("https://havkar.online/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "services_quote",
      method: "stripe",
      list_price_eur: 100
    })
  }).then((r) => r.json());
  mark("payments", "jobs_public_live_charging", jobsMethods.public_live_charging);
  mark("payments", "jobs_quote_charge_allowed_now", jobsQuote.charge_allowed_now);
  mark("payments", "jobs_quote_charge_created", jobsQuote.charge_created);
  mark("payments", "services_commission_bps", svcQuote.provider_commission_bps);
  mark("payments", "services_charge_allowed_now", svcQuote.charge_allowed_now);
  assert.equal(jobsQuote.charge_created, false);
  assert.equal(svcQuote.charge_created, false);
  assert.equal(svcQuote.provider_commission_bps, 1000);
}

(async function main() {
  await probePayments();

  const employer = await clientFor("employer");
  const applicant = await clientFor("applicant");
  const customer = await clientFor("customer");
  const provider = await clientFor("provider");
  mark("jobs", "employer_signin", employer.email);
  mark("jobs", "applicant_signin", applicant.email);
  mark("services", "customer_signin", customer.email);
  mark("services", "provider_signin", provider.email);

  // Applicant profile
  const profile = await applications.upsertApplicantProfile(applicant.sb, {
    userId: applicant.user.id,
    profile: {
      headline: "E2E applicant chef",
      summary: "Authenticated E2E profile for HAVKAR Jobs.",
      skills: "kitchen,pastry",
      location: "Crotone"
    }
  });
  if (!profile.ok) fail("jobs", "applicant_profile", profile);
  else mark("jobs", "applicant_profile", profile.row);

  // Employer creates a job row (pending_payment), then we mark active via RPC/SQL path if allowed.
  const jobInsert = await employer.sb
    .from("jobs")
    .insert({
      user_id: employer.user.id,
      title: "E2E Kitchen Assistant " + Date.now(),
      company: "E2E Employer Co",
      location: "Crotone",
      type: "Full-time",
      description: "E2E listing for authenticated application workflow. No fees to apply.",
      requirements: "Hygiene certificate",
      skills: "kitchen",
      plan: "Professional",
      monthly_fee: 19.99,
      status: "pending_payment",
      employer_kind: "ordinary"
    })
    .select("id,user_id,status,title")
    .single();
  if (jobInsert.error) {
    fail("jobs", "job_insert", jobInsert.error.message);
  } else {
    mark("jobs", "job_insert", jobInsert.data);
  }

  // Activate for public apply using service-side SQL is done outside; try update as employer (may be denied).
  let jobId = jobInsert.data && jobInsert.data.id;
  const activate = await employer.sb
    .from("jobs")
    .update({
      status: "active",
      expires_at: new Date(Date.now() + 30 * 864e5).toISOString()
    })
    .eq("id", jobId)
    .eq("user_id", employer.user.id)
    .select("id,status,expires_at")
    .maybeSingle();
  mark("jobs", "employer_self_activate_attempt", {
    ok: !activate.error && activate.data && activate.data.status === "active",
    error: activate.error && activate.error.message,
    row: activate.data
  });
  // Record whether payment gate correctly blocked unpaid self-activation.
  if (!(activate.data && activate.data.status === "active")) {
    mark("jobs", "unpaid_activation_blocked", true);
  }

  // If still pending, applications may be blocked by product rules; still exercise submit API against DB.
  const pdf = new Blob([Buffer.from("%PDF-1.4 E2E CV")], { type: "application/pdf" });
  pdf.name = "e2e-cv.pdf";
  // File-like for browser API; supabase-js accepts Blob/File
  const fakeFile = {
    name: "e2e-cv.pdf",
    type: "application/pdf",
    size: 64,
    // storage upload needs Blob/File/ArrayBuffer
    arrayBuffer: async () => Buffer.from("%PDF-1.4 E2E CV"),
    stream: undefined,
    text: async () => "%PDF-1.4 E2E CV"
  };
  // Use real Blob for upload
  const fileBlob = new File([Buffer.from("%PDF-1.4 E2E CV content")], "e2e-cv.pdf", {
    type: "application/pdf"
  });

  const submitted = await applications.submitApplication(applicant.sb, {
    jobId: jobId,
    applicantId: applicant.user.id,
    coverLetter: "I consent and can start next week for the E2E role.",
    applicantConsent: true,
    file: fileBlob
  });
  if (!submitted.ok) {
    // Retry without file if storage policy blocks
    const retry = await applications.submitApplication(applicant.sb, {
      jobId: jobId,
      applicantId: applicant.user.id,
      coverLetter: "I consent and can start next week for the E2E role.",
      applicantConsent: true
    });
    if (!retry.ok) fail("jobs", "submit_application", retry);
    else {
      mark("jobs", "submit_application", retry.row);
      mark("jobs", "cv_upload", "SKIPPED_STORAGE_OR_POLICY");
      Object.assign(submitted, retry);
    }
  } else {
    mark("jobs", "submit_application", {
      id: submitted.row.id,
      status: submitted.row.status,
      resume_path: submitted.row.resume_path
    });
    mark("jobs", "cv_upload", submitted.row.resume_path || null);
  }

  if (submitted.ok) {
    const listed = await applications.listForJob(employer.sb, jobId, employer.user.id);
    if (!listed.ok) fail("jobs", "employer_list_applications", listed);
    else mark("jobs", "employer_list_applications", listed.rows.length);

    const shortlist = await applications.decideApplication(employer.sb, {
      applicationId: submitted.row.id,
      status: "shortlisted",
      employerNotes: "E2E shortlist"
    });
    if (!shortlist.ok) fail("jobs", "shortlist", shortlist);
    else mark("jobs", "shortlist", shortlist.row.status);

    const interview = await applications.decideApplication(employer.sb, {
      applicationId: submitted.row.id,
      status: "interview",
      interviewAt: "2026-12-15T10:00:00Z"
    });
    if (!interview.ok) fail("jobs", "interview", interview);
    else mark("jobs", "interview", interview.row.interview_at);

    const rejectOther = await applications.decideApplication(employer.sb, {
      applicationId: submitted.row.id,
      status: "rejected",
      employerNotes: "E2E reject path"
    });
    mark("jobs", "reject", rejectOther.ok ? rejectOther.row.status : rejectOther);

    if (submitted.row.resume_path) {
      const signedEmployer = await applications.resumeSignedUrl(
        employer.sb,
        submitted.row.resume_path
      );
      mark("jobs", "employer_cv_signed_url", signedEmployer.ok);
      const signedStranger = await applications.resumeSignedUrl(
        customer.sb,
        submitted.row.resume_path
      );
      // stranger should fail storage policy
      mark("rls", "stranger_cv_signed_url_denied", signedStranger.ok === false);
    }
  }

  // Company onboarding
  const companyInsert = await employer.sb
    .from("job_companies")
    .insert({
      owner_user_id: employer.user.id,
      legal_name: "E2E Employer Legal SRL",
      verification_status: "unverified"
    });
  if (companyInsert.error) {
    fail("jobs", "company_register", companyInsert.error.message);
  }
  const company = await employer.sb
    .from("job_companies")
    .select("id,verification_status,legal_name")
    .eq("owner_user_id", employer.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (company.error || !company.data) fail("jobs", "company_register_select", company.error && company.error.message);
  else mark("jobs", "company_register", company.data);

  if (company.data) {
    const staff = await employer.sb
      .from("job_company_members")
      .upsert({
        company_id: company.data.id,
        user_id: employer.user.id,
        member_role: "owner"
      })
      .select("company_id,member_role")
      .single();
    mark("jobs", "company_staff_owner", !staff.error);

    // Adversarial: applicant cannot add themselves as owner of employer's company
    const hijack = await applicant.sb
      .from("job_company_members")
      .insert({
        company_id: company.data.id,
        user_id: applicant.user.id,
        member_role: "owner"
      })
      .select("company_id")
      .maybeSingle();
    mark("rls", "applicant_cannot_join_foreign_company", !!hijack.error);
  }

  // Notifications present for employer after application
  const notes = await employer.sb
    .from("notifications")
    .select("id,type,title,message")
    .eq("user_id", employer.user.id)
    .eq("type", "job")
    .order("created_at", { ascending: false })
    .limit(5);
  mark("jobs", "notifications", {
    ok: !notes.error,
    count: (notes.data || []).length,
    sample: (notes.data || [])[0] || null
  });

  // Services: provider publishes + availability; customer books
  const serviceInsert = await provider.sb
    .from("services")
    .insert({
      provider_id: provider.user.id,
      title: "E2E Home Cleaning " + Date.now(),
      description: "Authenticated E2E service listing",
      category: "Cleaning",
      price: 40,
      price_type: "hourly",
      currency: "EUR",
      location: "Crotone",
      status: "active"
    })
    .select("id,provider_id,title,status")
    .single();
  if (serviceInsert.error) {
    // schema may differ - capture exact error
    fail("services", "service_publish", serviceInsert.error.message);
  } else {
    mark("services", "service_publish", serviceInsert.data);
  }

  const serviceId = serviceInsert.data && serviceInsert.data.id;
  if (serviceId) {
    const slot = await serviceOps.upsertAvailability(provider.sb, {
      providerId: provider.user.id,
      serviceId: serviceId,
      slot_date: "2026-12-20",
      start_time: "09:00",
      end_time: "12:00",
      is_available: true
    });
    if (!slot.ok) fail("services", "availability", slot);
    else mark("services", "availability", slot.row || slot.slot);

    const booking = await customer.sb
      .from("service_bookings")
      .insert({
        service_id: serviceId,
        customer_id: customer.user.id,
        provider_id: provider.user.id,
        booking_date: "2026-12-20",
        booking_time: "09:00",
        status: "pending",
        agreed_price: 40,
        message: "E2E booking please"
      })
      .select("id,status,customer_id,provider_id,agreed_price")
      .single();
    if (booking.error) fail("services", "booking", booking.error.message);
    else mark("services", "booking", booking.data);

    if (booking.data) {
      const invoice = await serviceOps.issueInvoice(provider.sb, {
        id: booking.data.id,
        customer_id: booking.data.customer_id,
        provider_id: booking.data.provider_id,
        agreed_price: 40,
        currency: "EUR",
        payment_method: "unset"
      });
      if (!invoice.ok) fail("services", "invoice", invoice);
      else {
        mark("services", "invoice", {
          commission_bps: invoice.invoice.provider_commission_bps,
          commission_cents: invoice.invoice.provider_commission_cents,
          settlement_cents: invoice.invoice.provider_settlement_cents,
          persisted: invoice.persisted
        });
        assert.equal(invoice.invoice.provider_commission_bps, 1000);
      }

      const milestone = await serviceOps.createMilestone(provider.sb, {
        bookingId: booking.data.id,
        title: "Phase 1 clean",
        amount: 20
      });
      if (!milestone.ok) fail("services", "milestone", milestone);
      else mark("services", "milestone", milestone.row || milestone.milestone);

      // Complete booking path may need completion codes; try status update
      await provider.sb
        .from("service_bookings")
        .update({ status: "accepted" })
        .eq("id", booking.data.id)
        .eq("provider_id", provider.user.id);

      const dispute = await serviceOps.openDispute(customer.sb, {
        bookingId: booking.data.id,
        userId: customer.user.id,
        category: "refund_request",
        details: "E2E refund request path — service incomplete for test."
      });
      if (!dispute.ok) fail("services", "dispute", dispute);
      else mark("services", "dispute", dispute.row || dispute.dispute);

      // Verified review should fail until completed
      const earlyReview = await serviceOps.createVerifiedReview(customer.sb, {
        bookingId: booking.data.id,
        customerId: customer.user.id,
        providerId: provider.user.id,
        rating: 5,
        review_text: "Too early review attempt."
      });
      mark("services", "review_blocked_before_completed", earlyReview.ok === false);

      // Adversarial: applicant cannot read customer booking
      const leak = await applicant.sb
        .from("service_bookings")
        .select("id,customer_id,message")
        .eq("id", booking.data.id)
        .maybeSingle();
      const leaked =
        leak.data &&
        leak.data.id &&
        String(leak.data.customer_id) === String(customer.user.id);
      mark("rls", "stranger_cannot_read_private_booking", !leaked);

      const invoiceLeak = await applicant.sb
        .from("service_invoices")
        .select("id,customer_total_cents")
        .eq("booking_id", booking.data.id);
      mark("rls", "stranger_cannot_read_invoice", !(invoiceLeak.data && invoiceLeak.data.length));
    }
  }

  // Adversarial: applicant cannot list employer's applications for foreign job without ownership
  if (jobId) {
    const foreign = await customer.sb
      .from("job_applications")
      .select("id,applicant_id,cover_letter")
      .eq("job_id", jobId);
    const sawOthers = (foreign.data || []).some(
      (row) => String(row.applicant_id) !== String(customer.user.id)
    );
    mark("rls", "stranger_cannot_read_others_applications", !sawOthers);
  }

  report.finished_at = new Date().toISOString();
  report.overall = report.failures.length ? "FAIL" : "PASS_WITH_GAPS";
  fs.writeFileSync(
    "/opt/cursor/artifacts/e2e-jobs-services-auth-report.json",
    JSON.stringify(report, null, 2)
  );
  console.log("E2E_REPORT_WRITTEN", report.overall, "failures=", report.failures.length);
  if (report.failures.length) process.exitCode = 2;
})().catch((err) => {
  console.error(err);
  fs.writeFileSync(
    "/opt/cursor/artifacts/e2e-jobs-services-auth-report.json",
    JSON.stringify({ overall: "FAIL", error: String(err && err.stack || err) }, null, 2)
  );
  process.exit(1);
});
