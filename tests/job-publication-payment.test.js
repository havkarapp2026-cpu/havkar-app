const assert = require("assert");
const fs = require("fs");
const path = require("path");

(async function run() {
  const publication = await import("../lib/job-publication.mjs");
  assert.strictEqual(
    fs.existsSync(path.join(__dirname, "../api/job-publication.mjs")),
    false
  );
  const migration = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/20261009053000_job_publication_payments.sql"),
    "utf8"
  );
  const checkout = fs.readFileSync(
    path.join(__dirname, "../api/create-job-checkout.js"),
    "utf8"
  );
  const webhook = fs.readFileSync(
    path.join(__dirname, "../api/stripe-webhook.js"),
    "utf8"
  );
  const jobsPage = fs.readFileSync(
    path.join(__dirname, "../jobs.html"),
    "utf8"
  );

  assert.deepStrictEqual(
    Object.keys(publication.JOB_PUBLICATION_PLANS),
    ["Basic", "Professional", "Business"]
  );
  assert.strictEqual(publication.JOB_PUBLICATION_PLANS.Basic.cents, 999);
  assert.strictEqual(publication.JOB_PUBLICATION_PLANS.Professional.cents, 1999);
  assert.strictEqual(publication.JOB_PUBLICATION_PLANS.Business.cents, 3999);
  assert.strictEqual(publication.centsFromMoney("9.99"), 999);
  assert.strictEqual(publication.centsFromMoney("19.99"), 1999);
  assert.strictEqual(publication.centsFromMoney("39.99"), 3999);
  assert.strictEqual(publication.centsFromMoney("9.990"), null);
  assert.strictEqual(publication.planForStoredJob("Basic", "9.99").cents, 999);
  assert.strictEqual(publication.planForStoredJob("Basic", "0.01"), null);
  assert.strictEqual(publication.planForStoredJob("Basic", "9.990"), null);

  assert.strictEqual(
    publication.isStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_123"),
    true
  );
  assert.strictEqual(
    publication.isStripeCheckoutUrl("https://evil.example/checkout.stripe.com"),
    false
  );
  assert.strictEqual(
    publication.isStripeCheckoutUrl("http://checkout.stripe.com/c/pay/cs_test_123"),
    false
  );

  const paid = {
    id: "cs_test_job_123",
    mode: "payment",
    payment_status: "paid",
    currency: "eur",
    amount_total: 1999,
    metadata: {
      purpose: "job_publication",
      job_id: "42",
      havkar_user_id: "11111111-1111-4111-8111-111111111111",
      plan: "Professional",
    },
  };

  const accepted = publication.assessPaidJobSession(paid);
  assert.strictEqual(accepted.ok, true);
  assert.strictEqual(accepted.amount, "19.99");
  assert.strictEqual(accepted.currency, "EUR");
  assert.strictEqual(accepted.jobId, 42);

  assert.strictEqual(
    publication.assessPaidJobSession({
      ...paid,
      amount_total: 1,
    }).reason,
    "amount"
  );
  assert.strictEqual(
    publication.assessPaidJobSession({
      ...paid,
      payment_status: "unpaid",
    }).reason,
    "unpaid"
  );
  assert.strictEqual(
    publication.assessPaidJobSession({
      ...paid,
      metadata: {
        ...paid.metadata,
        event_ticket_id: "ticket-1",
      },
    }).reason,
    "ticket_metadata"
  );
  assert.strictEqual(
    publication.assessPaidJobSession({
      ...paid,
      metadata: {
        ...paid.metadata,
        purpose: "something_else",
      },
    }).reason,
    "purpose"
  );
  assert.strictEqual(
    publication.assessPaidJobSession({
      ...paid,
      currency: "usd",
    }).reason,
    "currency"
  );
  assert.strictEqual(
    publication.assessRecordableJobSession({
      ...paid,
      payment_status: "unpaid",
    }).ok,
    true
  );
  assert.strictEqual(
    publication.assessRecordableJobSession({
      ...paid,
      payment_status: "unpaid",
      amount_total: 50,
    }).reason,
    "amount"
  );

  assert.strictEqual(
    publication.checkoutReuseAction({
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    }),
    "reuse"
  );
  assert.strictEqual(
    publication.checkoutReuseAction({
      status: "complete",
      payment_status: "paid",
    }),
    "confirm"
  );
  assert.strictEqual(
    publication.checkoutReuseAction({
      status: "expired",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    }),
    "replace"
  );
  assert.strictEqual(
    publication.checkoutReuseAction({
      status: "complete",
      payment_status: "unpaid",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    }),
    "replace"
  );
  assert.strictEqual(
    publication.checkoutReuseAction({
      status: "open",
      url: "https://evil.example/pay",
    }),
    "replace"
  );
  assert.strictEqual(publication.unpaidJobOutcome("checkout.session.expired"), "expired");
  assert.strictEqual(
    publication.unpaidJobOutcome("checkout.session.async_payment_failed"),
    "failed"
  );
  assert.strictEqual(publication.unpaidJobOutcome("checkout.session.completed"), null);

  assert.ok(migration.includes("havkar.job_publication_job_id"));
  assert.ok(migration.includes("public.publish_paid_job"));
  assert.ok(
    migration.includes(
      "REVOKE ALL ON FUNCTION public.publish_paid_job(bigint, uuid, text, numeric, text, text, text)\n  FROM PUBLIC, anon, authenticated;"
    )
  );
  assert.ok(
    migration.includes(
      "GRANT EXECUTE ON FUNCTION public.publish_paid_job(bigint, uuid, text, numeric, text, text, text)\n  TO service_role;"
    )
  );
  assert.ok(!migration.includes("TO anon"));
  assert.ok(!migration.includes("TO authenticated"));
  assert.ok(migration.includes("enforce_job_publication_status trigger is missing"));
  assert.ok(migration.includes("WHERE status = 'paid'"));
  assert.ok(migration.includes("status IN ('paid', 'refunded', 'expired', 'failed')"));
  assert.ok(migration.includes("public.note_job_publication_outcome"));
  assert.ok(migration.includes("unsupported publication outcome"));
  assert.ok(migration.includes("FROM PUBLIC, anon, authenticated, service_role"));
  assert.ok(!migration.includes("GRANT SELECT, INSERT"));
  assert.ok(!/^\s*UPDATE\s+public\.jobs/im.test(
    migration.replace(/UPDATE public\.jobs[\s\S]*?monthly_fee IS NOT DISTINCT FROM p_amount;/, "")
  ));

  assert.ok(checkout.includes('purpose: "job_publication"'));
  assert.ok(checkout.includes("pending_confirmation"));
  assert.ok(checkout.includes("checkout.sessions.retrieve"));
  assert.ok(checkout.includes("checkoutReuseAction"));
  assert.ok(checkout.includes("String(job.user_id) !== String(user.id)"));
  assert.ok(checkout.includes("Number(req.body?.job_id)"));
  assert.ok(jobsPage.includes("job_id: Number(job.id)"));
  assert.ok(!checkout.includes("req.body.amount"));
  assert.ok(!checkout.includes("req.body.price"));
  assert.ok(!checkout.includes("req.body.monthly_fee"));
  assert.ok(!checkout.includes("req.body.plan"));
  assert.ok(!checkout.includes('.update('));
  assert.ok(!checkout.includes("STRIPE_WEBHOOK_SECRET"));

  const ticketBranch = webhook.indexOf("session.metadata?.event_ticket_id");
  const jobBranch = webhook.indexOf('session.metadata?.purpose === "job_publication"');
  assert.ok(ticketBranch > 0);
  assert.ok(jobBranch > ticketBranch);
  assert.ok(webhook.includes("stripe.webhooks.constructEvent"));
  assert.ok(webhook.includes("checkout.sessions.retrieve"));
  assert.ok(webhook.includes('supabase.rpc("publish_paid_job"'));
  assert.ok(webhook.includes('supabase.rpc("note_job_publication_outcome"'));
  assert.ok(webhook.includes("checkout.session.expired"));
  assert.ok(webhook.includes("checkout.session.async_payment_failed"));
  assert.ok(webhook.includes("job-publication-refund-"));
  assert.ok(webhook.includes("event_tickets"));
  assert.ok(webhook.includes('payment_status: "paid"'));
  assert.ok(!webhook.includes('.from("jobs")'));
  const handlerSource = webhook.slice(webhook.indexOf("export default async function handler"));
  assert.ok(handlerSource.includes("stripe.webhooks.constructEvent"));
  assert.ok(
    handlerSource.indexOf("stripe.webhooks.constructEvent") <
      handlerSource.indexOf("confirmJobPublication")
  );

  assert.ok(jobsPage.includes("isJobCheckoutUrl"));
  assert.ok(jobsPage.includes('id="jobPaymentNotice"'));
  assert.ok(jobsPage.includes("Payment was cancelled. Your advertisement has NOT been activated."));
  assert.ok(jobsPage.includes("The payment could not be started."));
  assert.ok(jobsPage.includes("The server has published this job."));
  assert.ok(jobsPage.includes('params.delete("session_id")'));
  assert.ok(!jobsPage.includes("checkout_session_id"));
  assert.ok(!jobsPage.includes('.from("jobs")\n      .update') && !jobsPage.includes(".update({"));
  assert.ok(!jobsPage.includes("payment_status"));

  console.log("JOB_PUBLICATION_PAYMENT_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
