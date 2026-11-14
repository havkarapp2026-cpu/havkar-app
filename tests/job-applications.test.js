"use strict";

const assert = require("assert");
const applications = require("../havkar-job-applications.js");

const applicantId = "22222222-2222-4222-8222-222222222222";
const employerId = "11111111-1111-4111-8111-111111111111";

function mockClient(handler) {
  const calls = [];
  return {
    calls: calls,
    storage: {
      from(bucket) {
        return {
          upload(path, file, options) {
            calls.push({ op: "upload", bucket: bucket, path: path, options: options, file: file });
            return Promise.resolve(handler({ op: "upload", path: path }));
          },
          remove(paths) {
            calls.push({ op: "remove", bucket: bucket, paths: paths });
            return Promise.resolve({ data: paths, error: null });
          },
          createSignedUrl(path, seconds) {
            calls.push({ op: "sign", bucket: bucket, path: path, seconds: seconds });
            return Promise.resolve(handler({ op: "sign", path: path }));
          }
        };
      }
    },
    from(table) {
      const state = { table: table, op: "", payload: null, filters: [] };
      const chain = {
        insert(payload) {
          state.op = "insert";
          state.payload = payload;
          return chain;
        },
        update(payload) {
          state.op = "update";
          state.payload = payload;
          return chain;
        },
        upsert(payload) {
          state.op = "upsert";
          state.payload = payload;
          return chain;
        },
        eq(column, value) {
          state.filters.push([column, value]);
          return chain;
        },
        maybeSingle() {
          return chain;
        },
        order() {
          return chain;
        },
        select() {
          return chain;
        },
        single() {
          return chain;
        },
        then(resolve, reject) {
          calls.push(state);
          return Promise.resolve(handler(state)).then(resolve, reject);
        }
      };
      return chain;
    }
  };
}

(async function run() {
  const path = applications.buildResumePath(
    applicantId.toUpperCase(),
    "33333333-3333-4333-8333-333333333333",
    "pdf"
  );
  assert.strictEqual(
    path,
    "22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf"
  );
  assert.strictEqual(applications.buildResumePath(applicantId, "not-a-uuid", "pdf"), "");
  assert.strictEqual(
    applications.validateResumeFile({ name: "cv.pdf", type: "application/pdf", size: 1200 }).extension,
    "pdf"
  );

  const client = mockClient(function (state) {
    if (state.op === "upload") return { data: { path: state.path }, error: null };
    if (state.op === "sign") return { data: { signedUrl: "https://storage.example/signed" }, error: null };
    if (state.table === "conversations") return { data: { id: "44444444-4444-4444-8444-444444444444" }, error: null };
    if (state.table === "jobs") return { data: { id: 9 }, error: null };
    if (state.table === "job_applications" && state.op === "insert") {
      return { data: Object.assign({ conversation_id: null }, state.payload), error: null };
    }
    if (state.op === "update" || state.op === "upsert") {
      return {
        data: [Object.assign({ id: "application-1", status: state.payload.status || "submitted" }, state.payload)],
        error: null
      };
    }
    return { data: [], error: null };
  });

  const noConsent = await applications.submitApplication(client, {
    jobId: 9,
    applicantId: applicantId,
    coverLetter: "I can start on Monday.",
    file: { name: "cv.pdf", type: "application/pdf", size: 1200 }
  });
  assert.strictEqual(noConsent.ok, false);
  assert.strictEqual(noConsent.reason, "consent_required");

  const submitted = await applications.submitApplication(client, {
    jobId: 9,
    applicantId: applicantId,
    coverLetter: "I can start on Monday.",
    applicantConsent: true,
    file: { name: "cv.pdf", type: "application/pdf", size: 1200 }
  });
  assert.strictEqual(submitted.ok, true);
  assert.strictEqual(submitted.row.status, "submitted");
  assert.ok(submitted.row.applicant_consent_at);
  assert.ok(submitted.row.resume_path.endsWith(".pdf"));

  const decision = await applications.decideApplication(client, {
    applicationId: submitted.row.id,
    status: "shortlisted"
  });
  assert.strictEqual(decision.ok, true);
  assert.strictEqual(decision.row.status, "shortlisted");

  const hired = await applications.decideApplication(client, {
    applicationId: submitted.row.id,
    status: "hired"
  });
  assert.strictEqual(hired.ok, true);

  const bad = await applications.decideApplication(client, {
    applicationId: "x",
    status: "accepted"
  });
  assert.strictEqual(bad.ok, false);

  const interview = await applications.decideApplication(client, {
    applicationId: submitted.row.id,
    status: "interview",
    interviewAt: "2026-12-01T10:00:00Z"
  });
  assert.strictEqual(interview.ok, true);
  assert.strictEqual(interview.row.status, "interview");

  const fraud = applications.fraudSignals(
    { title: "Chef", description: "Pay a registration fee to apply" },
    ["Chef", "Chef", "Chef"]
  );
  assert.strictEqual(fraud.illegal_recruitment_fee_language, true);
  assert.strictEqual(fraud.block_publish, true);

  const opened = await applications.openConversation(client, {
    application: {
      id: submitted.row.id,
      applicant_id: applicantId,
      conversation_id: null
    },
    applicantId: applicantId,
    employerId: employerId
  });
  assert.strictEqual(opened.ok, true);

  const signed = await applications.resumeSignedUrl(client, submitted.row.resume_path);
  assert.strictEqual(signed.ok, true);

  console.log("JOB_APPLICATIONS_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
