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
        eq(column, value) {
          state.filters.push([column, value]);
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
  assert.strictEqual(applications.buildResumePath(applicantId, "33333333-3333-4333-8333-333333333333", "exe"), "");
  assert.strictEqual(
    applications.validateResumeFile({ name: "cv.pdf", type: "application/pdf", size: 1200 }).extension,
    "pdf"
  );
  assert.strictEqual(
    applications.validateResumeFile({ name: "cv.exe", type: "application/pdf", size: 1200 }).ok,
    false
  );
  assert.strictEqual(
    applications.validateResumeFile({ name: "cv.pdf", type: "application/pdf", size: 6000000 }).ok,
    false
  );

  const client = mockClient(function (state) {
    if (state.op === "upload") return { data: { path: state.path }, error: null };
    if (state.op === "sign") return { data: { signedUrl: "https://storage.example/signed" }, error: null };
    if (state.table === "conversations") return { data: { id: "44444444-4444-4444-8444-444444444444" }, error: null };
    if (state.table === "job_applications" && state.op === "insert") {
      return { data: Object.assign({ conversation_id: null }, state.payload), error: null };
    }
    if (state.op === "update") {
      return { data: [Object.assign({ id: "application-1", status: state.payload.status || "pending" }, state.payload)], error: null };
    }
    return { data: [], error: null };
  });

  const file = { name: "cv.pdf", type: "application/pdf", size: 1200 };
  const submitted = await applications.submitApplication(client, {
    jobId: 9,
    applicantId: applicantId,
    coverLetter: "I can start on Monday.",
    file: file
  });
  assert.strictEqual(submitted.ok, true);
  assert.strictEqual(submitted.row.status, "pending");
  assert.strictEqual(submitted.row.job_id, 9);
  assert.ok(submitted.row.resume_path.endsWith(".pdf"));
  assert.strictEqual(client.calls[0].op, "upload");
  assert.strictEqual(client.calls[0].bucket, "job-resumes");
  assert.strictEqual(client.calls[0].options.upsert, false);
  assert.strictEqual(client.calls[1].table, "job_applications");

  const decision = await applications.decideApplication(client, {
    applicationId: submitted.row.id,
    status: "accepted"
  });
  assert.strictEqual(decision.ok, true);
  assert.strictEqual(decision.row.status, "accepted");
  assert.strictEqual(
    applications.decideApplication(client, { applicationId: "x", status: "hired" }).then
      ? (await applications.decideApplication(client, { applicationId: "x", status: "hired" })).ok
      : false,
    false
  );

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
  assert.strictEqual(opened.conversationId, "44444444-4444-4444-8444-444444444444");
  const conversationCall = client.calls.filter(function (call) {
    return call.table === "conversations";
  })[0];
  assert.strictEqual(conversationCall.payload.ad_id, null);
  assert.strictEqual(conversationCall.payload.buyer_id, applicantId);
  assert.strictEqual(conversationCall.payload.seller_id, employerId);

  const signed = await applications.resumeSignedUrl(client, submitted.row.resume_path);
  assert.strictEqual(signed.ok, true);
  assert.strictEqual(signed.url, "https://storage.example/signed");
  assert.strictEqual((await applications.resumeSignedUrl(client, "../secret.pdf")).ok, false);

  console.log("JOB_APPLICATIONS_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
